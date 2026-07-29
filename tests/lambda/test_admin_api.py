"""
Admin Lambda unit tests.

All AWS calls are mocked with moto — no real AWS credentials needed.
Run: pytest tests/lambda/test_admin_api.py -v

Loaded via importlib.util.spec_from_file_location under a unique module name:
test_license.py does a bare `import index`, and a second lambda's index.py
would collide with it in sys.modules.
"""
import hashlib
import hmac
import importlib.util
import json
import os
import time

import boto3
import pytest
from moto import mock_aws

ADMIN_INDEX = os.path.join(os.path.dirname(__file__), '../../cdk/lib/lambda/admin/index.py')

LICENSE_TABLE = 'AgentEnforcerLicenses'
DOCUMENTS_TABLE = 'AgentEnforcerDocuments'
SOURCE_BUCKET = 'agent-enforcer-source-test'
DIST_BUCKET = 'agent-enforcer-dist-test'
SECRET_NAME = 'agent-enforcer/config'


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def aws_resources(monkeypatch):
    """Spin up mocked DynamoDB, S3, and Secrets Manager for each test."""
    monkeypatch.setenv('AWS_DEFAULT_REGION', 'us-east-1')
    monkeypatch.setenv('AWS_ACCESS_KEY_ID', 'testing')
    monkeypatch.setenv('AWS_SECRET_ACCESS_KEY', 'testing')
    monkeypatch.setenv('AWS_SECURITY_TOKEN', 'testing')
    monkeypatch.setenv('AWS_SESSION_TOKEN', 'testing')
    monkeypatch.setenv('LICENSE_TABLE', LICENSE_TABLE)
    monkeypatch.setenv('DOCUMENTS_TABLE', DOCUMENTS_TABLE)
    monkeypatch.setenv('SOURCE_BUCKET', SOURCE_BUCKET)
    monkeypatch.setenv('DIST_BUCKET', DIST_BUCKET)

    with mock_aws():
        ddb = boto3.resource('dynamodb', region_name='us-east-1')
        license_table = ddb.create_table(
            TableName=LICENSE_TABLE,
            KeySchema=[{'AttributeName': 'license_id', 'KeyType': 'HASH'}],
            AttributeDefinitions=[{'AttributeName': 'license_id', 'AttributeType': 'S'}],
            BillingMode='PAY_PER_REQUEST',
        )
        license_table.put_item(Item={'license_id': 'COUNTER', 'active_count': 0, 'total_count': 0})

        documents_table = ddb.create_table(
            TableName=DOCUMENTS_TABLE,
            KeySchema=[{'AttributeName': 'id', 'KeyType': 'HASH'}],
            AttributeDefinitions=[{'AttributeName': 'id', 'AttributeType': 'S'}],
            BillingMode='PAY_PER_REQUEST',
        )

        s3 = boto3.client('s3', region_name='us-east-1')
        s3.create_bucket(Bucket=SOURCE_BUCKET)
        s3.create_bucket(Bucket=DIST_BUCKET)

        sm = boto3.client('secretsmanager', region_name='us-east-1')
        secret = sm.create_secret(
            Name=SECRET_NAME,
            SecretString=json.dumps({
                'max_licenses': 250,
                'admin_username': 'admin',
                'admin_password': 'password',
            }),
        )
        monkeypatch.setenv('CONFIG_SECRET_ARN', secret['ARN'])

        # Exec the module fresh under a unique name with mocked clients injected
        spec = importlib.util.spec_from_file_location('admin_index', ADMIN_INDEX)
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        m.dynamodb = ddb
        m.s3_client = s3
        m.sm_client = sm

        yield {
            'module': m,
            'license_table': license_table,
            'documents_table': documents_table,
            's3': s3,
            'sm': sm,
        }


def _event(route, body=None, token=None, path_params=None):
    event = {'routeKey': route, 'body': json.dumps(body) if body is not None else None}
    if token:
        event['headers'] = {'authorization': f'Bearer {token}'}
    if path_params:
        event['pathParameters'] = path_params
    return event


def _login(m, username='admin', password='password'):
    resp = m.handler(_event('POST /admin/login', {'username': username, 'password': password}), None)
    assert resp['statusCode'] == 200, resp['body']
    return json.loads(resp['body'])['token']


def _create_document(m, token, name='core-policy', filename='core-policy.md', description=''):
    resp = m.handler(_event('POST /admin/documents', {
        'name': name, 'description': description, 'filename': filename,
    }, token=token), None)
    assert resp['statusCode'] == 200, resp['body']
    return json.loads(resp['body'])


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

def test_login_success_returns_token(aws_resources):
    m = aws_resources['module']
    resp = m.handler(_event('POST /admin/login', {'username': 'admin', 'password': 'password'}), None)
    assert resp['statusCode'] == 200
    body = json.loads(resp['body'])
    assert '.' in body['token']
    assert body['username'] == 'admin'
    assert body['expires_at'] > '2026'


def test_login_default_credentials_when_secret_keys_absent(aws_resources):
    """The deployed secret may predate the admin keys — code defaults apply."""
    m = aws_resources['module']
    sm = aws_resources['sm']
    sm.put_secret_value(
        SecretId=os.environ['CONFIG_SECRET_ARN'],
        SecretString=json.dumps({'max_licenses': 250}),
    )
    token = _login(m)
    resp = m.handler(_event('GET /admin/documents', token=token), None)
    assert resp['statusCode'] == 200


def test_login_wrong_password_rejected(aws_resources):
    m = aws_resources['module']
    resp = m.handler(_event('POST /admin/login', {'username': 'admin', 'password': 'nope'}), None)
    assert resp['statusCode'] == 401
    assert 'invalid' in json.loads(resp['body'])['error'].lower()


def test_request_without_token_rejected(aws_resources):
    m = aws_resources['module']
    resp = m.handler(_event('GET /admin/documents'), None)
    assert resp['statusCode'] == 401


def test_request_with_tampered_token_rejected(aws_resources):
    m = aws_resources['module']
    token = _login(m)
    tampered = token[:-1] + ('0' if token[-1] != '0' else '1')
    resp = m.handler(_event('GET /admin/documents', token=tampered), None)
    assert resp['statusCode'] == 401


def test_request_with_expired_token_rejected(aws_resources):
    m = aws_resources['module']
    payload = m._b64url_encode(json.dumps({'u': 'admin', 'exp': int(time.time()) - 10}))
    signature = hmac.new(m._signing_key(m._admin_config()), payload.encode(), hashlib.sha256).hexdigest()
    resp = m.handler(_event('GET /admin/documents', token=f'{payload}.{signature}'), None)
    assert resp['statusCode'] == 401


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------

def test_create_document_persists_item_and_returns_upload_url(aws_resources):
    m = aws_resources['module']
    table = aws_resources['documents_table']
    token = _login(m)

    body = _create_document(m, token, description='Base rules')
    doc = body['document']
    assert doc['_version'] == 1
    assert doc['created_by'] == 'admin'
    assert doc['deleted'] is None
    assert body['upload_url'].startswith('https://')
    assert body['upload_expires_in'] == 600

    stored = table.get_item(Key={'id': doc['id']})['Item']
    assert stored['filename'] == 'core-policy.md'
    assert stored['name'] == 'core-policy'


def test_create_document_rejects_non_md_filename(aws_resources):
    m = aws_resources['module']
    token = _login(m)
    resp = m.handler(_event('POST /admin/documents', {
        'name': 'evil', 'filename': 'evil.sh',
    }, token=token), None)
    assert resp['statusCode'] == 400
    assert '.md' in json.loads(resp['body'])['error']


def test_create_document_duplicate_filename_conflict(aws_resources):
    m = aws_resources['module']
    token = _login(m)
    _create_document(m, token)
    resp = m.handler(_event('POST /admin/documents', {
        'name': 'core again', 'filename': 'core-policy.md',
    }, token=token), None)
    assert resp['statusCode'] == 409
    assert 'core-policy.md' in json.loads(resp['body'])['error']


def test_list_documents_excludes_settings_item(aws_resources):
    m = aws_resources['module']
    table = aws_resources['documents_table']
    token = _login(m)
    _create_document(m, token)
    table.put_item(Item={'id': 'SETTINGS', 'assistants': {'claude-code': True}})

    resp = m.handler(_event('GET /admin/documents', token=token), None)
    docs = json.loads(resp['body'])['documents']
    assert len(docs) == 1
    assert docs[0]['name'] == 'core-policy'


def test_list_documents_includes_soft_deleted_with_status(aws_resources):
    m = aws_resources['module']
    token = _login(m)
    doc_id = _create_document(m, token)['document']['id']
    m.handler(_event('DELETE /admin/documents/{id}', token=token,
                     path_params={'id': doc_id}), None)

    resp = m.handler(_event('GET /admin/documents', token=token), None)
    docs = json.loads(resp['body'])['documents']
    assert len(docs) == 1
    assert docs[0]['deleted'] is not None


def test_update_document_increments_version_and_sets_updated_by(aws_resources):
    m = aws_resources['module']
    token = _login(m)
    doc_id = _create_document(m, token)['document']['id']

    resp = m.handler(_event('PUT /admin/documents/{id}', {
        'name': 'renamed', 'description': 'updated desc',
    }, token=token, path_params={'id': doc_id}), None)
    assert resp['statusCode'] == 200
    doc = json.loads(resp['body'])['document']
    assert doc['name'] == 'renamed'
    assert doc['description'] == 'updated desc'
    assert doc['_version'] == 2
    assert doc['updated_by'] == 'admin'


def test_delete_document_soft_deletes_and_removes_s3_object(aws_resources):
    m = aws_resources['module']
    s3 = aws_resources['s3']
    table = aws_resources['documents_table']
    token = _login(m)

    doc_id = _create_document(m, token)['document']['id']
    s3.put_object(Bucket=SOURCE_BUCKET, Key='core-policy.md', Body=b'# rules')

    resp = m.handler(_event('DELETE /admin/documents/{id}', token=token,
                            path_params={'id': doc_id}), None)
    assert resp['statusCode'] == 200
    doc = json.loads(resp['body'])['document']
    assert doc['deleted'] is not None
    assert doc['_version'] == 2

    stored = table.get_item(Key={'id': doc_id})['Item']
    assert stored['deleted'] is not None
    keys = [o['Key'] for o in s3.list_objects_v2(Bucket=SOURCE_BUCKET).get('Contents', [])]
    assert 'core-policy.md' not in keys


def test_upload_url_for_missing_document_returns_404(aws_resources):
    m = aws_resources['module']
    token = _login(m)
    resp = m.handler(_event('POST /admin/documents/{id}/upload-url', token=token,
                            path_params={'id': 'no-such-doc'}), None)
    assert resp['statusCode'] == 404


def test_download_url_returns_presigned_get(aws_resources):
    m = aws_resources['module']
    token = _login(m)
    doc_id = _create_document(m, token)['document']['id']

    resp = m.handler(_event('POST /admin/documents/{id}/download-url', token=token,
                            path_params={'id': doc_id}), None)
    assert resp['statusCode'] == 200
    url = json.loads(resp['body'])['download_url']
    assert url.startswith('https://')
    assert 'core-policy.md' in url


def test_download_url_missing_document_returns_404(aws_resources):
    m = aws_resources['module']
    token = _login(m)
    resp = m.handler(_event('POST /admin/documents/{id}/download-url', token=token,
                            path_params={'id': 'no-such-doc'}), None)
    assert resp['statusCode'] == 404


def test_download_url_soft_deleted_document_returns_404(aws_resources):
    m = aws_resources['module']
    token = _login(m)
    doc_id = _create_document(m, token)['document']['id']
    m.handler(_event('DELETE /admin/documents/{id}', token=token,
                     path_params={'id': doc_id}), None)

    resp = m.handler(_event('POST /admin/documents/{id}/download-url', token=token,
                            path_params={'id': doc_id}), None)
    assert resp['statusCode'] == 404


# ---------------------------------------------------------------------------
# Stats + agents
# ---------------------------------------------------------------------------

def test_stats_returns_license_and_document_counts(aws_resources):
    m = aws_resources['module']
    license_table = aws_resources['license_table']
    token = _login(m)

    license_table.put_item(Item={'license_id': 'COUNTER', 'active_count': 3, 'total_count': 5})
    _create_document(m, token)
    deleted_id = _create_document(m, token, name='old', filename='old.md')['document']['id']
    m.handler(_event('DELETE /admin/documents/{id}', token=token,
                     path_params={'id': deleted_id}), None)

    resp = m.handler(_event('GET /admin/stats', token=token), None)
    assert resp['statusCode'] == 200
    stats = json.loads(resp['body'])
    assert stats['active_licenses'] == 3
    assert stats['total_licenses'] == 5
    assert stats['max_licenses'] == 250
    assert stats['documents'] == 1  # soft-deleted docs don't count
    assert stats['assistants_enabled'] == 1  # claude-code default


def test_stats_counts_unique_operating_systems(aws_resources):
    m = aws_resources['module']
    license_table = aws_resources['license_table']
    token = _login(m)

    license_table.put_item(Item={'license_id': 'COUNTER', 'active_count': 2, 'total_count': 3})
    license_table.put_item(Item={
        'license_id': 'lic-1', 'id': 1, 'user_id': 'user-1',
        'agent_type': 'ROCKY9', 'agent_version': '0.3.0',
        'machine_id': 'machine-1', 'created_date': '2026-07-01T00:00:00Z',
        'last_used_date': '2026-07-19T00:00:00Z', 'active': True,
    })
    license_table.put_item(Item={
        'license_id': 'lic-2', 'id': 2, 'user_id': 'user-2',
        'agent_type': 'ROCKY9', 'agent_version': '0.3.0',
        'machine_id': 'machine-2', 'created_date': '2026-07-01T00:00:00Z',
        'last_used_date': '2026-07-19T00:00:00Z', 'active': True,
    })
    license_table.put_item(Item={
        'license_id': 'lic-3', 'id': 3, 'user_id': 'user-3',
        'agent_type': 'UBUNTU22', 'agent_version': '0.3.0',
        'machine_id': 'machine-3', 'created_date': '2026-07-01T00:00:00Z',
        'last_used_date': '2026-07-19T00:00:00Z', 'active': False,
    })

    resp = m.handler(_event('GET /admin/stats', token=token), None)
    assert resp['statusCode'] == 200
    stats = json.loads(resp['body'])
    assert stats['unique_platforms'] == 2  # ROCKY9 + UBUNTU22; COUNTER excluded, inactive still counted


def test_agents_lists_licenses_excluding_counter(aws_resources):
    m = aws_resources['module']
    license_table = aws_resources['license_table']
    token = _login(m)

    license_table.put_item(Item={
        'license_id': 'lic-1', 'id': 1, 'user_id': 'i-abc123',
        'agent_type': 'ROCKY9', 'agent_version': '0.3.0',
        'machine_id': 'secret-machine', 'created_date': '2026-07-01T00:00:00Z',
        'last_used_date': '2026-07-19T00:00:00Z', 'active': True,
    })

    resp = m.handler(_event('GET /admin/agents', token=token), None)
    assert resp['statusCode'] == 200
    body = json.loads(resp['body'])
    assert body['count'] == 1
    agent = body['agents'][0]
    assert agent['user_id'] == 'i-abc123'
    assert agent['active'] is True
    # sync credentials stay server-side
    assert 'license_id' not in agent
    assert 'machine_id' not in agent


# ---------------------------------------------------------------------------
# Agent deregistration
# ---------------------------------------------------------------------------

def _seed_license(license_table, num_id, active=True):
    license_table.put_item(Item={
        'license_id': f'lic-{num_id}', 'id': num_id, 'user_id': f'user-{num_id}',
        'agent_type': 'ROCKY9', 'agent_version': '0.3.0',
        'machine_id': f'machine-{num_id}', 'created_date': '2026-07-01T00:00:00Z',
        'last_used_date': '2026-07-19T00:00:00Z', 'active': active,
    })


def test_deregister_agent_deactivates_license_and_decrements_counter(aws_resources):
    m = aws_resources['module']
    license_table = aws_resources['license_table']
    token = _login(m)

    license_table.put_item(Item={'license_id': 'COUNTER', 'active_count': 2, 'total_count': 2})
    _seed_license(license_table, 1)
    _seed_license(license_table, 2)

    resp = m.handler(_event('DELETE /admin/agents/{id}', token=token,
                            path_params={'id': '1'}), None)
    assert resp['statusCode'] == 200
    assert json.loads(resp['body']) == {'id': 1}

    assert license_table.get_item(Key={'license_id': 'lic-1'})['Item']['active'] is False
    assert license_table.get_item(Key={'license_id': 'lic-2'})['Item']['active'] is True
    counter = license_table.get_item(Key={'license_id': 'COUNTER'})['Item']
    assert counter['active_count'] == 1


def test_deregister_agent_missing_id_returns_404(aws_resources):
    m = aws_resources['module']
    token = _login(m)
    resp = m.handler(_event('DELETE /admin/agents/{id}', token=token,
                            path_params={'id': '99'}), None)
    assert resp['statusCode'] == 404


def test_deregister_agent_already_inactive_returns_404(aws_resources):
    m = aws_resources['module']
    license_table = aws_resources['license_table']
    token = _login(m)

    license_table.put_item(Item={'license_id': 'COUNTER', 'active_count': 5, 'total_count': 5})
    _seed_license(license_table, 1, active=False)

    resp = m.handler(_event('DELETE /admin/agents/{id}', token=token,
                            path_params={'id': '1'}), None)
    assert resp['statusCode'] == 404
    counter = license_table.get_item(Key={'license_id': 'COUNTER'})['Item']
    assert counter['active_count'] == 5  # untouched


def test_deregister_agent_non_numeric_id_returns_404(aws_resources):
    m = aws_resources['module']
    token = _login(m)
    resp = m.handler(_event('DELETE /admin/agents/{id}', token=token,
                            path_params={'id': 'abc'}), None)
    assert resp['statusCode'] == 404


def test_deregister_agent_counter_never_goes_negative(aws_resources):
    m = aws_resources['module']
    license_table = aws_resources['license_table']
    token = _login(m)

    # Drifted state: an active license but a zero counter
    license_table.put_item(Item={'license_id': 'COUNTER', 'active_count': 0, 'total_count': 1})
    _seed_license(license_table, 1)

    resp = m.handler(_event('DELETE /admin/agents/{id}', token=token,
                            path_params={'id': '1'}), None)
    assert resp['statusCode'] == 200
    assert license_table.get_item(Key={'license_id': 'lic-1'})['Item']['active'] is False
    counter = license_table.get_item(Key={'license_id': 'COUNTER'})['Item']
    assert counter['active_count'] == 0  # floored, not -1


# ---------------------------------------------------------------------------
# Assistant toggles
# ---------------------------------------------------------------------------

def test_get_assistants_returns_defaults_when_settings_missing(aws_resources):
    m = aws_resources['module']
    token = _login(m)
    resp = m.handler(_event('GET /admin/assistants', token=token), None)
    assert resp['statusCode'] == 200
    assert json.loads(resp['body'])['assistants'] == {
        'claude-code': True, 'kiro': False, 'cursor': False, 'github-copilot': False,
    }


def test_put_assistants_persists_toggles(aws_resources):
    m = aws_resources['module']
    table = aws_resources['documents_table']
    token = _login(m)

    resp = m.handler(_event('PUT /admin/assistants', {
        'assistants': {'claude-code': False, 'cursor': True},
    }, token=token), None)
    assert resp['statusCode'] == 200
    assistants = json.loads(resp['body'])['assistants']
    assert assistants['claude-code'] is False
    assert assistants['cursor'] is True
    assert assistants['kiro'] is False

    stored = table.get_item(Key={'id': 'SETTINGS'})['Item']['assistants']
    assert stored['cursor'] is True

    unknown = m.handler(_event('PUT /admin/assistants', {
        'assistants': {'clippy': True},
    }, token=token), None)
    assert unknown['statusCode'] == 400


# ---------------------------------------------------------------------------
# Bundle inspection
# ---------------------------------------------------------------------------

def _seed_bundle(s3):
    s3.put_object(Bucket=DIST_BUCKET, Key='claude-code/latest/CLAUDE.md', Body=b'# Enforced rules')
    s3.put_object(Bucket=DIST_BUCKET, Key='claude-code/latest/settings.json', Body=b'{"hooks":{}}')
    s3.put_object(Bucket=DIST_BUCKET, Key='claude-code/latest/skills/python.md', Body=b'# Python rules')


def test_bundle_list_returns_files_with_metadata(aws_resources):
    m = aws_resources['module']
    _seed_bundle(aws_resources['s3'])
    token = _login(m)

    resp = m.handler(_event('GET /admin/assistants/{assistant}/bundle', token=token,
                            path_params={'assistant': 'claude-code'}), None)
    assert resp['statusCode'] == 200
    body = json.loads(resp['body'])
    assert body['assistant'] == 'claude-code'
    assert [f['path'] for f in body['files']] == ['CLAUDE.md', 'settings.json', 'skills/python.md']
    for f in body['files']:
        assert isinstance(f['size'], int) and f['size'] > 0
        assert 'T' in f['updated'] and f['updated'].endswith('Z')


def test_bundle_list_empty_for_assistant_without_pipeline(aws_resources):
    m = aws_resources['module']
    _seed_bundle(aws_resources['s3'])
    token = _login(m)

    resp = m.handler(_event('GET /admin/assistants/{assistant}/bundle', token=token,
                            path_params={'assistant': 'kiro'}), None)
    assert resp['statusCode'] == 200
    assert json.loads(resp['body']) == {'assistant': 'kiro', 'files': []}


def test_bundle_list_unknown_assistant_returns_404(aws_resources):
    m = aws_resources['module']
    token = _login(m)
    resp = m.handler(_event('GET /admin/assistants/{assistant}/bundle', token=token,
                            path_params={'assistant': 'clippy'}), None)
    assert resp['statusCode'] == 404


def test_bundle_file_returns_content_and_decodes_encoded_slash(aws_resources):
    m = aws_resources['module']
    _seed_bundle(aws_resources['s3'])
    token = _login(m)

    for path_value in ('skills/python.md', 'skills%2Fpython.md'):
        resp = m.handler(_event('GET /admin/assistants/{assistant}/bundle/{path+}', token=token,
                                path_params={'assistant': 'claude-code', 'path': path_value}), None)
        assert resp['statusCode'] == 200, path_value
        body = json.loads(resp['body'])
        assert body['path'] == 'skills/python.md'
        assert body['content'] == '# Python rules'


def test_bundle_file_missing_or_traversal_returns_404(aws_resources):
    m = aws_resources['module']
    s3 = aws_resources['s3']
    _seed_bundle(s3)
    # An object outside the assistant prefix that traversal must not reach
    s3.put_object(Bucket=DIST_BUCKET, Key='secret', Body=b'top secret')
    token = _login(m)

    for path_value in ('nope.md', '../../secret', '/CLAUDE.md', ''):
        resp = m.handler(_event('GET /admin/assistants/{assistant}/bundle/{path+}', token=token,
                                path_params={'assistant': 'claude-code', 'path': path_value}), None)
        assert resp['statusCode'] == 404, path_value


def test_unknown_route_returns_404(aws_resources):
    m = aws_resources['module']
    token = _login(m)
    resp = m.handler(_event('GET /admin/nope', token=token), None)
    assert resp['statusCode'] == 404


def test_new_admin_routes_require_token(aws_resources):
    m = aws_resources['module']
    routes = [
        ('DELETE /admin/agents/{id}', {'id': '1'}),
        ('POST /admin/documents/{id}/download-url', {'id': 'some-doc'}),
        ('GET /admin/assistants/{assistant}/bundle', {'assistant': 'claude-code'}),
        ('GET /admin/assistants/{assistant}/bundle/{path+}',
         {'assistant': 'claude-code', 'path': 'CLAUDE.md'}),
    ]
    for route, params in routes:
        resp = m.handler(_event(route, path_params=params), None)
        assert resp['statusCode'] == 401, route


# ---------------------------------------------------------------------------
# v1.0: PDF documents, build status, downloads, applied versions
# ---------------------------------------------------------------------------

BUILDS_TABLE = 'AgentEnforcerBuilds'
INSTALLER_BUCKET = 'agent-enforcer-rpm-test'


def _create_builds_table(seed=()):
    ddb = boto3.resource('dynamodb', region_name='us-east-1')
    table = ddb.create_table(
        TableName=BUILDS_TABLE,
        KeySchema=[
            {'AttributeName': 'assistant', 'KeyType': 'HASH'},
            {'AttributeName': 'version', 'KeyType': 'RANGE'},
        ],
        AttributeDefinitions=[
            {'AttributeName': 'assistant', 'AttributeType': 'S'},
            {'AttributeName': 'version', 'AttributeType': 'S'},
        ],
        BillingMode='PAY_PER_REQUEST',
    )
    for item in seed:
        table.put_item(Item=item)
    return table


def test_create_document_accepts_pdf(aws_resources):
    m = aws_resources['module']
    token = _login(m)
    resp = m.handler(_event('POST /admin/documents', {
        'name': 'NIST controls', 'description': 'gov compliance',
        'filename': 'NIST.SP.800-53r5.pdf',
    }, token=token), None)
    assert resp['statusCode'] == 200
    body = json.loads(resp['body'])
    assert body['document']['filename'] == 'NIST.SP.800-53r5.pdf'
    assert body['upload_url'].startswith('https://')


def test_create_document_rejects_unsupported_extension(aws_resources):
    m = aws_resources['module']
    token = _login(m)
    resp = m.handler(_event('POST /admin/documents', {
        'name': 'bad', 'description': '', 'filename': 'rules.docx',
    }, token=token), None)
    assert resp['statusCode'] == 400
    assert '.md or .pdf' in json.loads(resp['body'])['error']


def test_build_status_reports_current_stale_and_missing(aws_resources, monkeypatch):
    m = aws_resources['module']
    s3 = aws_resources['s3']
    token = _login(m)

    # Three tracked docs in the source bucket
    for key, body in [('core.md', b'# core v2'), ('sec.md', b'# sec'), ('new.md', b'# new')]:
        s3.put_object(Bucket=SOURCE_BUCKET, Key=key, Body=body)
        _create_document(m, token, name=key.split('.')[0], filename=key)
    stale_etag = 'not-the-current-etag'
    sec_etag = s3.head_object(Bucket=SOURCE_BUCKET, Key='sec.md')['ETag'].strip('"')

    _create_builds_table(seed=[{
        'assistant': 'claude-code', 'version': '1753751000000',
        'built_at': '2026-07-28T22:00:00Z',
        'docs': [
            {'key': 'core.md', 'etag': stale_etag},   # changed since build
            {'key': 'sec.md', 'etag': sec_etag},       # current
        ],
        'files': ['CLAUDE.md'], 'zip_key': 'zips/claude-code.1753751000000.zip',
    }])
    monkeypatch.setenv('BUILDS_TABLE', BUILDS_TABLE)

    resp = m.handler(_event('GET /admin/build-status', token=token), None)
    assert resp['statusCode'] == 200
    body = json.loads(resp['body'])
    assert body['builds']['claude-code']['version'] == '1753751000000'
    assert body['builds']['cursor'] is None
    by_file = {d['filename']: d['status'] for d in body['documents']}
    assert by_file['core.md']['claude-code'] == 'stale'
    assert by_file['sec.md']['claude-code'] == 'current'
    assert by_file['new.md']['claude-code'] == 'missing'
    assert all(s['cursor'] == 'missing' for s in by_file.values())


def test_downloads_installers_lists_latest_and_versions(aws_resources, monkeypatch):
    m = aws_resources['module']
    s3 = aws_resources['s3']
    token = _login(m)
    s3.create_bucket(Bucket=INSTALLER_BUCKET)
    for key in [
        'installers/latest/agent-enforcer.rpm',
        'installers/latest/agent-enforcer.pkg',
        'installers/1.0.0/agent-enforcer-1.0.0-1.el9.noarch.rpm',
        'installers/1.0.0/agent-enforcer-1.0.0.pkg',
        'installers/0.4.0/agent-enforcer-0.4.0-1.el9.noarch.rpm',
        'build-logs/should-be-ignored.log',
        'agent-enforcer-legacy.rpm',  # legacy flat key — not under installers/
    ]:
        s3.put_object(Bucket=INSTALLER_BUCKET, Key=key, Body=b'binary')
    monkeypatch.setenv('INSTALLER_BUCKET', INSTALLER_BUCKET)

    resp = m.handler(_event('GET /admin/downloads/installers', token=token), None)
    assert resp['statusCode'] == 200
    installers = json.loads(resp['body'])['installers']
    assert len(installers) == 5  # log + legacy flat key excluded
    latest = [i for i in installers if i['latest']]
    assert {i['platform'] for i in latest} == {'linux', 'macos'}
    # Latest entries sort before versioned history
    assert installers[0]['latest'] and installers[1]['latest']
    assert all(i['url'].startswith(f'https://{INSTALLER_BUCKET}.s3.amazonaws.com/') for i in installers)


def test_downloads_bundles_presigns_zips_newest_first(aws_resources, monkeypatch):
    m = aws_resources['module']
    token = _login(m)
    _create_builds_table(seed=[
        {'assistant': 'claude-code', 'version': '1753664600000',
         'built_at': '2026-07-27T22:00:00Z', 'zip_key': 'zips/claude-code.1753664600000.zip'},
        {'assistant': 'claude-code', 'version': '1753751000000',
         'built_at': '2026-07-28T22:00:00Z', 'zip_key': 'zips/claude-code.1753751000000.zip'},
        {'assistant': 'cursor', 'version': '1753751000000',
         'built_at': '2026-07-28T22:00:00Z', 'zip_key': 'zips/cursor.1753751000000.zip'},
    ])
    monkeypatch.setenv('BUILDS_TABLE', BUILDS_TABLE)

    resp = m.handler(_event('GET /admin/downloads/bundles', token=token), None)
    assert resp['statusCode'] == 200
    bundles = json.loads(resp['body'])['bundles']
    assert len(bundles) == 3
    versions = [b['version'] for b in bundles]
    assert versions == sorted(versions, reverse=True)
    newest_cc = next(b for b in bundles if b['assistant'] == 'claude-code' and b['latest'])
    assert newest_cc['version'] == '1753751000000'
    assert newest_cc['filename'] == 'claude-code.1753751000000.zip'
    assert newest_cc['zip_url'].startswith('https://')
    oldest_cc = next(b for b in bundles if b['version'] == '1753664600000')
    assert oldest_cc['latest'] is False


def test_agents_include_applied_versions(aws_resources):
    m = aws_resources['module']
    license_table = aws_resources['license_table']
    token = _login(m)
    license_table.put_item(Item={
        'license_id': 'lic-1', 'id': 1, 'user_id': 'i-abc123',
        'agent_type': 'ROCKY9', 'agent_version': '1.0.0',
        'machine_id': 'm-1', 'created_date': '2026-07-01T00:00:00Z',
        'last_used_date': '2026-07-29T00:00:00Z', 'active': True,
        'applied_versions': {'claude-code': '1753751000000', 'cursor': '1753751000000'},
    })
    license_table.put_item(Item={
        'license_id': 'lic-2', 'id': 2, 'user_id': 'i-def456',
        'agent_type': 'ROCKY9', 'agent_version': '0.4.0',
        'machine_id': 'm-2', 'created_date': '2026-07-01T00:00:00Z',
        'last_used_date': '2026-07-28T00:00:00Z', 'active': True,
    })

    resp = m.handler(_event('GET /admin/agents', token=token), None)
    assert resp['statusCode'] == 200
    agents = {a['user_id']: a for a in json.loads(resp['body'])['agents']}
    assert agents['i-abc123']['applied_versions'] == {
        'claude-code': '1753751000000', 'cursor': '1753751000000',
    }
    assert agents['i-def456']['applied_versions'] == {}  # pre-1.0 agent — never reported
