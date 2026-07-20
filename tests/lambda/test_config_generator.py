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
