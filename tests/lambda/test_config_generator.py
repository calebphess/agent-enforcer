"""
Config-generator Lambda unit tests — assistant toggle gating and the
documents-registry auto-registration for direct S3 uploads.

Bedrock is stubbed at the module level (no model call); everything else is
mocked with moto. Run: pytest tests/lambda/test_config_generator.py -v

Loaded via importlib.util.spec_from_file_location under a unique module name
(same index.py collision hazard as test_admin_api.py). This module reads
DIST_BUCKET/BEDROCK_MODEL_ID at import time, so env is set before exec.
"""
import importlib.util
import json
import os
from datetime import datetime, timezone

import boto3
import pytest
from moto import mock_aws

GENERATOR_INDEX = os.path.join(
    os.path.dirname(__file__), '../../cdk/lib/lambda/config-generator/index.py'
)

SOURCE_BUCKET = 'agent-enforcer-source-test'
DIST_BUCKET = 'agent-enforcer-dist-test'
DOCUMENTS_TABLE = 'AgentEnforcerDocuments'
BUILDS_TABLE = 'AgentEnforcerBuilds'


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def aws_resources(monkeypatch):
    monkeypatch.setenv('AWS_DEFAULT_REGION', 'us-east-1')
    monkeypatch.setenv('AWS_ACCESS_KEY_ID', 'testing')
    monkeypatch.setenv('AWS_SECRET_ACCESS_KEY', 'testing')
    monkeypatch.setenv('AWS_SECURITY_TOKEN', 'testing')
    monkeypatch.setenv('AWS_SESSION_TOKEN', 'testing')
    # Read at import time — must be set before the module is executed
    monkeypatch.setenv('DIST_BUCKET', DIST_BUCKET)
    monkeypatch.setenv('BEDROCK_MODEL_ID', 'test-model')
    monkeypatch.setenv('DOCUMENTS_TABLE', DOCUMENTS_TABLE)
    monkeypatch.setenv('BUILDS_TABLE', BUILDS_TABLE)

    with mock_aws():
        s3 = boto3.client('s3', region_name='us-east-1')
        s3.create_bucket(Bucket=SOURCE_BUCKET)
        s3.create_bucket(Bucket=DIST_BUCKET)

        ddb = boto3.resource('dynamodb', region_name='us-east-1')
        documents_table = ddb.create_table(
            TableName=DOCUMENTS_TABLE,
            KeySchema=[{'AttributeName': 'id', 'KeyType': 'HASH'}],
            AttributeDefinitions=[{'AttributeName': 'id', 'AttributeType': 'S'}],
            BillingMode='PAY_PER_REQUEST',
        )
        builds_table = ddb.create_table(
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

        spec = importlib.util.spec_from_file_location('config_generator_index', GENERATOR_INDEX)
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        m.s3 = s3
        m.dynamodb = ddb

        # Stub Bedrock: record calls, return a canned bundle
        bedrock_calls = []

        def fake_call_bedrock(docs):
            bedrock_calls.append(docs)
            return {'files': {'CLAUDE.md': '# Generated rules'}, 'version': '2026-07-19'}

        m._call_bedrock = fake_call_bedrock

        yield {
            'module': m,
            's3': s3,
            'documents_table': documents_table,
            'builds_table': builds_table,
            'bedrock_calls': bedrock_calls,
        }


def _s3_event(key, event_name='ObjectCreated:Put'):
    return {'Records': [{
        'eventName': event_name,
        's3': {'bucket': {'name': SOURCE_BUCKET}, 'object': {'key': key}},
    }]}


def _now_iso():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


# ---------------------------------------------------------------------------
# Assistant toggle gating
# ---------------------------------------------------------------------------

def test_generation_skipped_when_claude_code_disabled(aws_resources):
    m = aws_resources['module']
    s3 = aws_resources['s3']
    aws_resources['documents_table'].put_item(Item={
        'id': 'SETTINGS', 'assistants': {'claude-code': False},
    })
    s3.put_object(Bucket=SOURCE_BUCKET, Key='core.md', Body=b'# rules')

    m.handler(_s3_event('core.md'), None)

    assert aws_resources['bedrock_calls'] == []
    assert 'Contents' not in s3.list_objects_v2(Bucket=DIST_BUCKET)


def test_generation_proceeds_when_settings_item_missing(aws_resources):
    """Fail-open: no SETTINGS item means generation runs as before."""
    m = aws_resources['module']
    s3 = aws_resources['s3']
    s3.put_object(Bucket=SOURCE_BUCKET, Key='core.md', Body=b'# rules')

    m.handler(_s3_event('core.md'), None)

    assert len(aws_resources['bedrock_calls']) == 1
    latest = s3.get_object(Bucket=DIST_BUCKET, Key='claude-code/latest/CLAUDE.md')
    assert latest['Body'].read() == b'# Generated rules'


# ---------------------------------------------------------------------------
# Documents-registry auto-registration
# ---------------------------------------------------------------------------

def test_s3_upload_registers_untracked_document(aws_resources):
    """Direct `aws s3 cp` uploads get a registry record created for them."""
    m = aws_resources['module']
    s3 = aws_resources['s3']
    table = aws_resources['documents_table']
    s3.put_object(Bucket=SOURCE_BUCKET, Key='enforcement-doc-security.md', Body=b'# sec')

    m.handler(_s3_event('enforcement-doc-security.md'), None)

    items = [i for i in table.scan()['Items'] if i['id'] != 'SETTINGS']
    assert len(items) == 1
    doc = items[0]
    assert doc['name'] == 'enforcement-doc-security'
    assert doc['description'] == 'Uploaded directly to S3'
    assert doc['filename'] == 'enforcement-doc-security.md'
    assert doc['created_by'] == 's3-upload'
    assert int(doc['_version']) == 1


def test_s3_upload_refreshes_stale_document_record(aws_resources):
    m = aws_resources['module']
    s3 = aws_resources['s3']
    table = aws_resources['documents_table']
    table.put_item(Item={
        'id': 'doc-1', 'name': 'core', 'description': '', 'filename': 'core.md',
        'created': '2026-01-01T00:00:00Z', 'updated': '2026-01-01T00:00:00Z',
        'deleted': None, '_version': 1, 'created_by': 'admin', 'updated_by': 'admin',
    })
    s3.put_object(Bucket=SOURCE_BUCKET, Key='core.md', Body=b'# v2')

    m.handler(_s3_event('core.md'), None)

    doc = table.get_item(Key={'id': 'doc-1'})['Item']
    assert int(doc['_version']) == 2
    assert doc['updated_by'] == 's3-upload'
    assert doc['updated'] > '2026-01-01T00:00:00Z'


def test_s3_upload_skips_refresh_for_recent_ui_upload(aws_resources):
    """A record written moments ago is the UI-managed upload's own — no bump."""
    m = aws_resources['module']
    s3 = aws_resources['s3']
    table = aws_resources['documents_table']
    just_now = _now_iso()
    table.put_item(Item={
        'id': 'doc-1', 'name': 'core', 'description': '', 'filename': 'core.md',
        'created': just_now, 'updated': just_now,
        'deleted': None, '_version': 1, 'created_by': 'admin', 'updated_by': 'admin',
    })
    s3.put_object(Bucket=SOURCE_BUCKET, Key='core.md', Body=b'# rules')

    m.handler(_s3_event('core.md'), None)

    doc = table.get_item(Key={'id': 'doc-1'})['Item']
    assert int(doc['_version']) == 1
    assert doc['updated_by'] == 'admin'
    assert doc['updated'] == just_now


def test_object_removed_event_does_not_create_record(aws_resources):
    """Removal events regenerate the bundle but never touch the registry."""
    m = aws_resources['module']
    s3 = aws_resources['s3']
    table = aws_resources['documents_table']
    # One doc remains in the bucket after the delete
    s3.put_object(Bucket=SOURCE_BUCKET, Key='remaining.md', Body=b'# keep')

    m.handler(_s3_event('deleted-doc.md', event_name='ObjectRemoved:Delete'), None)

    assert table.scan()['Items'] == []
    # Regeneration still ran from the remaining docs
    assert len(aws_resources['bedrock_calls']) == 1
    assert list(aws_resources['bedrock_calls'][0].keys()) == ['remaining.md']


# ---------------------------------------------------------------------------
# v1.0: epoch-millis versions, build records, zips, cursor pipeline
# ---------------------------------------------------------------------------

def _enable_cursor(table):
    table.put_item(Item={'id': 'SETTINGS', 'assistants': {'claude-code': True, 'cursor': True}})


def _install_multi_assistant_bedrock(m):
    """Fake that serves both prompts and records which system prompt was used."""
    calls = []

    def fake(docs, system_prompt=m.SYSTEM_PROMPT):
        calls.append(system_prompt)
        if system_prompt == m.CURSOR_SYSTEM_PROMPT:
            return {'files': {'AGENTS.md': '<!-- managed by agent-enforcer -->\n# Rules'}}
        return {'files': {'CLAUDE.md': '# Generated rules'}}

    m._call_bedrock = fake
    return calls


def test_version_is_epoch_millis(aws_resources):
    m = aws_resources['module']
    s3 = aws_resources['s3']
    s3.put_object(Bucket=SOURCE_BUCKET, Key='core.md', Body=b'# rules')

    before = int(__import__('time').time() * 1000)
    m.handler(_s3_event('core.md'), None)
    after = int(__import__('time').time() * 1000)

    keys = [o['Key'] for o in s3.list_objects_v2(Bucket=DIST_BUCKET)['Contents']]
    versioned = [k for k in keys if k.startswith('claude-code/') and '/latest/' not in k]
    assert versioned, f'no versioned bundle keys in {keys}'
    version = versioned[0].split('/')[1]
    assert version.isdigit()
    assert before <= int(version) <= after


def test_build_record_written_with_doc_etags(aws_resources):
    m = aws_resources['module']
    s3 = aws_resources['s3']
    builds = aws_resources['builds_table']
    s3.put_object(Bucket=SOURCE_BUCKET, Key='core.md', Body=b'# rules')
    expected_etag = s3.head_object(Bucket=SOURCE_BUCKET, Key='core.md')['ETag'].strip('"')

    m.handler(_s3_event('core.md'), None)

    items = builds.scan()['Items']
    assert len(items) == 1
    record = items[0]
    assert record['assistant'] == 'claude-code'
    assert record['version'].isdigit()
    assert record['docs'] == [{'key': 'core.md', 'etag': expected_etag}]
    assert record['files'] == ['CLAUDE.md']
    assert record['zip_key'] == f"zips/claude-code.{record['version']}.zip"


def test_latest_pointer_updated_per_build(aws_resources):
    """The newest build record is queryable newest-first — the 'latest' pointer."""
    m = aws_resources['module']
    s3 = aws_resources['s3']
    builds = aws_resources['builds_table']
    s3.put_object(Bucket=SOURCE_BUCKET, Key='core.md', Body=b'# v1')
    m.handler(_s3_event('core.md'), None)
    s3.put_object(Bucket=SOURCE_BUCKET, Key='core.md', Body=b'# v2 changed')
    m.handler(_s3_event('core.md'), None)

    from boto3.dynamodb.conditions import Key as DdbKey
    resp = builds.query(
        KeyConditionExpression=DdbKey('assistant').eq('claude-code'),
        ScanIndexForward=False,
    )
    versions = [i['version'] for i in resp['Items']]
    assert len(versions) == 2
    assert versions[0] >= versions[1]  # newest first


def test_zip_artifact_written_per_build(aws_resources):
    m = aws_resources['module']
    s3 = aws_resources['s3']
    s3.put_object(Bucket=SOURCE_BUCKET, Key='core.md', Body=b'# rules')

    m.handler(_s3_event('core.md'), None)

    keys = [o['Key'] for o in s3.list_objects_v2(Bucket=DIST_BUCKET, Prefix='zips/')['Contents']]
    assert len(keys) == 1
    import io as _io
    import zipfile as _zipfile
    body = s3.get_object(Bucket=DIST_BUCKET, Key=keys[0])['Body'].read()
    with _zipfile.ZipFile(_io.BytesIO(body)) as zf:
        assert zf.namelist() == ['CLAUDE.md']
        assert zf.read('CLAUDE.md') == b'# Generated rules'


def test_cursor_bundle_generated_when_enabled(aws_resources):
    m = aws_resources['module']
    s3 = aws_resources['s3']
    _enable_cursor(aws_resources['documents_table'])
    calls = _install_multi_assistant_bedrock(m)
    s3.put_object(Bucket=SOURCE_BUCKET, Key='core.md', Body=b'# rules')

    m.handler(_s3_event('core.md'), None)

    assert m.CURSOR_SYSTEM_PROMPT in calls
    agents = s3.get_object(Bucket=DIST_BUCKET, Key='cursor/latest/AGENTS.md')['Body'].read()
    assert agents.startswith(b'<!-- managed by agent-enforcer -->')
    zip_keys = [o['Key'] for o in s3.list_objects_v2(Bucket=DIST_BUCKET, Prefix='zips/')['Contents']]
    assert any(k.startswith('zips/cursor.') for k in zip_keys)
    build_assistants = {i['assistant'] for i in aws_resources['builds_table'].scan()['Items']}
    assert build_assistants == {'claude-code', 'cursor'}


def test_cursor_bundle_skipped_by_default(aws_resources):
    """No SETTINGS item: cursor defaults off, claude-code defaults on."""
    m = aws_resources['module']
    s3 = aws_resources['s3']
    s3.put_object(Bucket=SOURCE_BUCKET, Key='core.md', Body=b'# rules')

    m.handler(_s3_event('core.md'), None)

    keys = [o['Key'] for o in s3.list_objects_v2(Bucket=DIST_BUCKET)['Contents']]
    assert not any(k.startswith('cursor/') for k in keys)
    assert any(k.startswith('claude-code/latest/') for k in keys)


def test_deleting_last_doc_clears_latest_and_pointers(aws_resources):
    m = aws_resources['module']
    s3 = aws_resources['s3']
    s3.put_object(Bucket=SOURCE_BUCKET, Key='core.md', Body=b'# rules')
    m.handler(_s3_event('core.md'), None)
    assert s3.list_objects_v2(Bucket=DIST_BUCKET, Prefix='claude-code/latest/')['KeyCount'] > 0

    # Delete the only source doc, then fire the removal event
    s3.delete_object(Bucket=SOURCE_BUCKET, Key='core.md')
    m.handler(_s3_event('core.md', event_name='ObjectRemoved:Delete'), None)

    assert s3.list_objects_v2(Bucket=DIST_BUCKET, Prefix='claude-code/latest/')['KeyCount'] == 0
    assert s3.list_objects_v2(Bucket=DIST_BUCKET, Prefix='cursor/latest/')['KeyCount'] == 0


# ---------------------------------------------------------------------------
# PDF distillation
# ---------------------------------------------------------------------------

def _install_pdf_stubs(m):
    """Stub the pypdf extraction and per-chunk model call; record invocations."""
    extract_calls = []
    distill_calls = []

    def fake_extract(data):
        extract_calls.append(data)
        return 'RAW COMPLIANCE TEXT ' * 10

    def fake_chunk(chunk, name, index, total):
        distill_calls.append(name)
        return '- use parameterized queries'

    m._extract_pdf_text = fake_extract
    m._distill_chunk = fake_chunk
    return extract_calls, distill_calls


def test_pdf_distilled_and_included_in_synthesis(aws_resources):
    m = aws_resources['module']
    s3 = aws_resources['s3']
    extract_calls, distill_calls = _install_pdf_stubs(m)
    s3.put_object(Bucket=SOURCE_BUCKET, Key='nist.pdf', Body=b'%PDF-1.7 fake')

    m.handler(_s3_event('nist.pdf'), None)

    assert len(extract_calls) == 1
    assert distill_calls, 'distillation never ran'
    # The distilled text (not raw PDF bytes) reached the synthesis call
    assert len(aws_resources['bedrock_calls']) == 1
    docs = aws_resources['bedrock_calls'][0]
    assert docs['nist.pdf'] == '- use parameterized queries'
    # Distilled text is cached in the dist bucket keyed by source ETag
    etag = s3.head_object(Bucket=SOURCE_BUCKET, Key='nist.pdf')['ETag'].strip('"')
    cached = s3.get_object(Bucket=DIST_BUCKET, Key=f'distilled/nist.pdf.{etag}.md')['Body'].read()
    assert cached == b'- use parameterized queries'


def test_pdf_distillation_cached_by_etag(aws_resources):
    m = aws_resources['module']
    s3 = aws_resources['s3']
    extract_calls, _ = _install_pdf_stubs(m)
    s3.put_object(Bucket=SOURCE_BUCKET, Key='nist.pdf', Body=b'%PDF-1.7 fake')

    m.handler(_s3_event('nist.pdf'), None)
    m.handler(_s3_event('nist.pdf'), None)  # unchanged content → same ETag

    assert len(extract_calls) == 1, 'second run should reuse the cached distillation'


def test_pdf_upload_registers_document(aws_resources):
    m = aws_resources['module']
    s3 = aws_resources['s3']
    table = aws_resources['documents_table']
    _install_pdf_stubs(m)
    s3.put_object(Bucket=SOURCE_BUCKET, Key='NIST.SP.800-53r5.pdf', Body=b'%PDF-1.7 fake')

    m.handler(_s3_event('NIST.SP.800-53r5.pdf'), None)

    items = [i for i in table.scan()['Items'] if i['id'] != 'SETTINGS']
    assert len(items) == 1
    assert items[0]['filename'] == 'NIST.SP.800-53r5.pdf'
    assert items[0]['created_by'] == 's3-upload'


def test_cursor_mdc_files_get_managed_marker(aws_resources):
    """The marker is injected after mdc frontmatter when the model omits it."""
    m = aws_resources['module']
    s3 = aws_resources['s3']
    _enable_cursor(aws_resources['documents_table'])

    def fake(docs, system_prompt=m.SYSTEM_PROMPT):
        if system_prompt == m.CURSOR_SYSTEM_PROMPT:
            return {'files': {
                'AGENTS.md': '# Rules without marker',
                '.cursor/rules/db.mdc': '---\ndescription: db rules\nalwaysApply: false\n---\n- use params\n\nSources: core.md',
            }}
        return {'files': {'CLAUDE.md': '# Generated rules'}}

    m._call_bedrock = fake
    s3.put_object(Bucket=SOURCE_BUCKET, Key='core.md', Body=b'# rules')

    m.handler(_s3_event('core.md'), None)

    agents = s3.get_object(Bucket=DIST_BUCKET, Key='cursor/latest/AGENTS.md')['Body'].read().decode()
    assert agents.startswith('<!-- managed by agent-enforcer -->')
    mdc = s3.get_object(Bucket=DIST_BUCKET, Key='cursor/latest/.cursor/rules/db.mdc')['Body'].read().decode()
    lines = mdc.split('\n')
    # Marker sits immediately after the closing frontmatter delimiter (line 3)
    assert lines[0] == '---'
    assert lines[3] == '---'
    assert lines[4] == '<!-- managed by agent-enforcer -->', lines[:6]
