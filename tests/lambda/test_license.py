"""
License Lambda unit tests.

All AWS calls are mocked with moto — no real AWS credentials needed.
Run: pytest tests/lambda/test_license.py -v
"""
import json
import os
import sys
import uuid

import boto3
import pytest
from moto import mock_aws

# Make the lambda module importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../cdk/lib/lambda/license'))

TABLE_NAME = 'AgentEnforcerLicenses'
DIST_BUCKET = 'agent-enforcer-dist-test'
SECRET_NAME = 'agent-enforcer/config'


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def aws_resources(monkeypatch):
    """Spin up mocked DynamoDB, S3, and Secrets Manager for each test."""
    # Moto requires these; set before mock_aws context so boto3 clients use them
    monkeypatch.setenv('AWS_DEFAULT_REGION', 'us-east-1')
    monkeypatch.setenv('AWS_ACCESS_KEY_ID', 'testing')
    monkeypatch.setenv('AWS_SECRET_ACCESS_KEY', 'testing')
    monkeypatch.setenv('AWS_SECURITY_TOKEN', 'testing')
    monkeypatch.setenv('AWS_SESSION_TOKEN', 'testing')
    monkeypatch.setenv('LICENSE_TABLE', TABLE_NAME)
    monkeypatch.setenv('DIST_BUCKET', DIST_BUCKET)

    with mock_aws():
        # DynamoDB
        ddb = boto3.resource('dynamodb', region_name='us-east-1')
        table = ddb.create_table(
            TableName=TABLE_NAME,
            KeySchema=[{'AttributeName': 'license_id', 'KeyType': 'HASH'}],
            AttributeDefinitions=[
                {'AttributeName': 'license_id', 'AttributeType': 'S'},
                {'AttributeName': 'user_id', 'AttributeType': 'S'},
            ],
            GlobalSecondaryIndexes=[{
                'IndexName': 'UserIndex',
                'KeySchema': [{'AttributeName': 'user_id', 'KeyType': 'HASH'}],
                'Projection': {'ProjectionType': 'ALL'},
            }],
            BillingMode='PAY_PER_REQUEST',
        )
        # Seed the counter item
        table.put_item(Item={'license_id': 'COUNTER', 'active_count': 0, 'total_count': 0})

        # S3
        s3 = boto3.client('s3', region_name='us-east-1')
        s3.create_bucket(Bucket=DIST_BUCKET)
        s3.put_object(Bucket=DIST_BUCKET, Key='claude-code/latest/CLAUDE.md', Body=b'# Test Rules')
        s3.put_object(Bucket=DIST_BUCKET, Key='claude-code/latest/settings.json', Body=b'{}')

        # Secrets Manager — create secret, then set its ARN in env for the lambda
        sm = boto3.client('secretsmanager', region_name='us-east-1')
        secret = sm.create_secret(
            Name=SECRET_NAME,
            SecretString=json.dumps({'max_licenses': 250}),
        )
        monkeypatch.setenv('CONFIG_SECRET_ARN', secret['ARN'])

        # Load (or reload) the lambda module with mocked clients injected
        import importlib
        import index as m
        importlib.reload(m)
        m.dynamodb = ddb
        m.s3_client = s3
        m.sm_client = sm

        yield {'table': table, 's3': s3, 'sm': sm, 'module': m}


def _register_event(user_id='test@example.com', agent_type='ROCKY9',
                    agent_version='0.2.1', machine_id='abc123',
                    old_license_id=None, old_user_id=None):
    body = {
        'user_id': user_id,
        'agent_type': agent_type,
        'agent_version': agent_version,
        'machine_id': machine_id,
    }
    if old_license_id:
        body['old_license_id'] = old_license_id
        body['old_user_id'] = old_user_id or user_id
    return {'routeKey': 'POST /agent-enforcer/register', 'body': json.dumps(body)}


def _sync_event(license_id, machine_id='abc123'):
    return {
        'routeKey': 'POST /agent-enforcer/sync',
        'body': json.dumps({'license_id': license_id, 'machine_id': machine_id}),
    }


# ---------------------------------------------------------------------------
# Register — happy paths
# ---------------------------------------------------------------------------

def test_register_new_license_happy_path(aws_resources):
    m = aws_resources['module']
    resp = m.handler(_register_event(), None)
    assert resp['statusCode'] == 200
    body = json.loads(resp['body'])
    assert 'license_id' in body
    assert body['user_id'] == 'test@example.com'
    assert 'registered successfully' in body['message'].lower()


def test_register_multiple_licenses_same_user(aws_resources):
    """Same user_id can hold multiple active licenses (each agent needs its own)."""
    m = aws_resources['module']
    r1 = m.handler(_register_event(machine_id='machine-1'), None)
    r2 = m.handler(_register_event(machine_id='machine-2'), None)
    assert r1['statusCode'] == 200
    assert r2['statusCode'] == 200
    id1 = json.loads(r1['body'])['license_id']
    id2 = json.loads(r2['body'])['license_id']
    assert id1 != id2


def test_register_transfer_deactivates_old_license(aws_resources):
    """Transfer: old license deactivated, new one created, active_count unchanged."""
    m = aws_resources['module']
    table = aws_resources['table']

    # Register original
    r1 = m.handler(_register_event(), None)
    old_license_id = json.loads(r1['body'])['license_id']

    counter_before = table.get_item(Key={'license_id': 'COUNTER'})['Item']
    active_before = int(counter_before['active_count'])

    # Transfer
    r2 = m.handler(_register_event(
        machine_id='new-machine',
        old_license_id=old_license_id,
        old_user_id='test@example.com',
    ), None)
    assert r2['statusCode'] == 200
    new_license_id = json.loads(r2['body'])['license_id']
    assert new_license_id != old_license_id

    # Old license must be inactive
    old_item = table.get_item(Key={'license_id': old_license_id})['Item']
    assert old_item['active'] is False

    # New license must be active
    new_item = table.get_item(Key={'license_id': new_license_id})['Item']
    assert new_item['active'] is True

    # active_count unchanged
    counter_after = table.get_item(Key={'license_id': 'COUNTER'})['Item']
    assert int(counter_after['active_count']) == active_before


# ---------------------------------------------------------------------------
# Register — error paths
# ---------------------------------------------------------------------------

def test_register_enforces_max_licenses(aws_resources):
    """When active_count >= max_licenses, registration is rejected with 403."""
    m = aws_resources['module']
    sm = aws_resources['sm']
    table = aws_resources['table']

    # Set max to 2 in the secret
    secret_arn = os.environ['CONFIG_SECRET_ARN']
    sm.put_secret_value(SecretId=secret_arn, SecretString=json.dumps({'max_licenses': 2}))

    # Pre-fill counter
    table.update_item(
        Key={'license_id': 'COUNTER'},
        UpdateExpression='SET active_count = :v',
        ExpressionAttributeValues={':v': 2},
    )

    resp = m.handler(_register_event(), None)
    assert resp['statusCode'] == 403
    body = json.loads(resp['body'])
    assert 'limit' in body['error'].lower()


def test_register_transfer_wrong_user_id_rejected(aws_resources):
    """Transfer with wrong old_user_id returns 403."""
    m = aws_resources['module']
    r1 = m.handler(_register_event(), None)
    old_license_id = json.loads(r1['body'])['license_id']

    resp = m.handler(_register_event(
        machine_id='new-machine',
        old_license_id=old_license_id,
        old_user_id='wrong@example.com',  # does not match
    ), None)
    assert resp['statusCode'] == 403
    assert 'user_id' in json.loads(resp['body'])['error'].lower()


def test_register_transfer_inactive_license_rejected(aws_resources):
    """Transferring an already-inactive license returns 404."""
    m = aws_resources['module']
    table = aws_resources['table']

    r1 = m.handler(_register_event(), None)
    old_license_id = json.loads(r1['body'])['license_id']

    # Manually deactivate
    table.update_item(
        Key={'license_id': old_license_id},
        UpdateExpression='SET active = :f',
        ExpressionAttributeValues={':f': False},
    )

    resp = m.handler(_register_event(
        machine_id='new-machine',
        old_license_id=old_license_id,
        old_user_id='test@example.com',
    ), None)
    assert resp['statusCode'] == 404
    assert 'inactive' in json.loads(resp['body'])['error'].lower()


def test_register_missing_user_id(aws_resources):
    m = aws_resources['module']
    body = {'agent_type': 'ROCKY9', 'agent_version': '0.2.1', 'machine_id': 'abc'}
    resp = m.handler({'routeKey': 'POST /agent-enforcer/register', 'body': json.dumps(body)}, None)
    assert resp['statusCode'] == 400
    assert 'user_id' in json.loads(resp['body'])['error'].lower()


def test_register_missing_agent_type(aws_resources):
    m = aws_resources['module']
    body = {'user_id': 'test@example.com', 'agent_version': '0.2.1', 'machine_id': 'abc'}
    resp = m.handler({'routeKey': 'POST /agent-enforcer/register', 'body': json.dumps(body)}, None)
    assert resp['statusCode'] == 400
    assert 'agent_type' in json.loads(resp['body'])['error'].lower()


def test_register_user_id_too_long(aws_resources):
    m = aws_resources['module']
    resp = m.handler(_register_event(user_id='x' * 256), None)
    assert resp['statusCode'] == 400
    assert '255' in json.loads(resp['body'])['error']


# ---------------------------------------------------------------------------
# Sync — happy paths
# ---------------------------------------------------------------------------

def test_sync_happy_path_returns_presigned_urls(aws_resources):
    m = aws_resources['module']
    r = m.handler(_register_event(), None)
    license_id = json.loads(r['body'])['license_id']

    resp = m.handler(_sync_event(license_id), None)
    assert resp['statusCode'] == 200
    body = json.loads(resp['body'])
    assert 'files' in body
    assert 'CLAUDE.md' in body['files']
    assert 'settings.json' in body['files']
    # Presigned URLs start with https://
    assert body['files']['CLAUDE.md'].startswith('https://')


def test_sync_updates_last_used_date(aws_resources):
    m = aws_resources['module']
    table = aws_resources['table']

    r = m.handler(_register_event(), None)
    license_id = json.loads(r['body'])['license_id']

    original = table.get_item(Key={'license_id': license_id})['Item']['last_used_date']

    import time; time.sleep(1)
    m.handler(_sync_event(license_id), None)

    updated = table.get_item(Key={'license_id': license_id})['Item']['last_used_date']
    assert updated >= original  # must be same or later


def test_sync_empty_dist_bucket_returns_empty_files(aws_resources):
    """If the dist bucket has no files, return empty files dict without error."""
    m = aws_resources['module']
    s3 = aws_resources['s3']

    # Remove all objects from dist prefix
    s3.delete_object(Bucket=DIST_BUCKET, Key='claude-code/latest/CLAUDE.md')
    s3.delete_object(Bucket=DIST_BUCKET, Key='claude-code/latest/settings.json')

    r = m.handler(_register_event(), None)
    license_id = json.loads(r['body'])['license_id']

    resp = m.handler(_sync_event(license_id), None)
    assert resp['statusCode'] == 200
    assert json.loads(resp['body'])['files'] == {}


# ---------------------------------------------------------------------------
# Sync — error paths
# ---------------------------------------------------------------------------

def test_sync_wrong_machine_id_rejected(aws_resources):
    m = aws_resources['module']
    r = m.handler(_register_event(machine_id='real-machine'), None)
    license_id = json.loads(r['body'])['license_id']

    resp = m.handler(_sync_event(license_id, machine_id='wrong-machine'), None)
    assert resp['statusCode'] == 403
    assert 'machine_id' in json.loads(resp['body'])['error'].lower()


def test_sync_inactive_license_rejected(aws_resources):
    m = aws_resources['module']
    table = aws_resources['table']

    r = m.handler(_register_event(), None)
    license_id = json.loads(r['body'])['license_id']

    table.update_item(
        Key={'license_id': license_id},
        UpdateExpression='SET active = :f',
        ExpressionAttributeValues={':f': False},
    )

    resp = m.handler(_sync_event(license_id), None)
    assert resp['statusCode'] == 403
    assert 'inactive' in json.loads(resp['body'])['error'].lower()


def test_sync_nonexistent_license_rejected(aws_resources):
    m = aws_resources['module']
    resp = m.handler(_sync_event('00000000-0000-0000-0000-000000000000'), None)
    assert resp['statusCode'] == 404
    assert 'not found' in json.loads(resp['body'])['error'].lower()


def test_sync_missing_license_id(aws_resources):
    m = aws_resources['module']
    resp = m.handler({
        'routeKey': 'POST /agent-enforcer/sync',
        'body': json.dumps({'machine_id': 'abc'}),
    }, None)
    assert resp['statusCode'] == 400
    assert 'license_id' in json.loads(resp['body'])['error'].lower()
