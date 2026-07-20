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


def test_unknown_route_returns_404(aws_resources):
    m = aws_resources['module']
    token = _login(m)
    resp = m.handler(_event('GET /admin/nope', token=token), None)
    assert resp['statusCode'] == 404
