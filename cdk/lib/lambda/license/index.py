"""
License Lambda — Agent Enforcer

Handles two routes dispatched by API Gateway HTTP API:

  POST /agent-enforcer/register
    - New registration: checks MAX_LICENSES, atomically increments active_count, creates license
    - Transfer: deactivates old license (verified by user_id match), creates new one
    - Binds license to machine_id to prevent copy-paste reuse on a different host

  POST /agent-enforcer/sync
    - Validates license (active + machine_id match)
    - Updates last_used_date; persists agent-reported applied_versions/agent_version
    - Returns per-assistant bundle manifests (presigned latest/ URLs + build
      version) for every enabled generatable assistant, plus the legacy
      claude-code `files` map for pre-1.0 agents
    - Returns the per-assistant enforcement toggles (documents table SETTINGS item)
      so agents can report what they enforce via `agent-enforcer describe`

Environment variables are read at handler call time (not import time) so that tests
can inject mocked values without import-order issues.
"""
import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')
sm_client = boto3.client('secretsmanager')

PRESIGNED_EXPIRY = 600  # 10 minutes

KNOWN_ASSISTANTS = ('claude-code', 'kiro', 'cursor', 'github-copilot')
DEFAULT_ASSISTANTS = {name: (name == 'claude-code') for name in KNOWN_ASSISTANTS}

# Assistants with a working generation pipeline (bundles served on sync)
GENERATABLE_ASSISTANTS = ('claude-code', 'cursor')


def handler(event: dict, context: Any) -> dict:
    route = event.get('routeKey', '')
    try:
        body = json.loads(event.get('body') or '{}')
    except json.JSONDecodeError:
        return _resp(400, {'error': 'Invalid JSON body'})

    if route == 'POST /agent-enforcer/register':
        return _register(body)
    if route == 'POST /agent-enforcer/sync':
        return _sync(body)

    return _resp(404, {'error': f'Unknown route: {route}'})


# ---------------------------------------------------------------------------
# Register
# ---------------------------------------------------------------------------

def _register(body: dict) -> dict:
    user_id = (body.get('user_id') or '').strip()
    agent_type = (body.get('agent_type') or '').strip()
    agent_version = (body.get('agent_version') or '').strip()
    machine_id = (body.get('machine_id') or '').strip()
    old_license_id = (body.get('old_license_id') or '').strip()
    old_user_id = (body.get('old_user_id') or '').strip()

    if not user_id:
        return _resp(400, {'error': 'user_id is required'})
    if len(user_id) > 255:
        return _resp(400, {'error': 'user_id must be 255 characters or fewer'})
    if not agent_type:
        return _resp(400, {'error': 'agent_type is required'})
    if not agent_version:
        return _resp(400, {'error': 'agent_version is required'})
    if not machine_id:
        return _resp(400, {'error': 'machine_id is required'})

    now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    new_license_id = str(uuid.uuid4())

    if old_license_id and old_user_id:
        return _register_transfer(
            user_id, agent_type, agent_version, machine_id,
            old_license_id, old_user_id, new_license_id, now
        )
    return _register_new(user_id, agent_type, agent_version, machine_id, new_license_id, now)


def _register_new(user_id, agent_type, agent_version, machine_id, new_license_id, now):
    table_name = os.environ['LICENSE_TABLE']
    max_licenses = _get_max_licenses()
    table = dynamodb.Table(table_name)

    # Atomically check active_count < max and increment both counters
    try:
        counter_resp = table.update_item(
            Key={'license_id': 'COUNTER'},
            UpdateExpression='ADD active_count :one, total_count :one',
            ConditionExpression='attribute_not_exists(active_count) OR active_count < :max',
            ExpressionAttributeValues={':one': 1, ':max': max_licenses},
            ReturnValues='UPDATED_NEW',
        )
    except ClientError as e:
        if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
            return _resp(403, {
                'error': 'License limit reached',
                'detail': f'Maximum of {max_licenses} active licenses already in use.',
            })
        raise

    new_id = int(counter_resp['Attributes'].get('total_count', 1))

    table.put_item(Item={
        'license_id': new_license_id,
        'id': new_id,
        'user_id': user_id,
        'agent_type': agent_type,
        'agent_version': agent_version,
        'machine_id': machine_id,
        'created_date': now,
        'last_used_date': now,
        'active': True,
    })

    print(f"Registered new license {new_license_id} for user {user_id} (id={new_id})")
    return _resp(200, {
        'license_id': new_license_id,
        'user_id': user_id,
        'message': 'License registered successfully. Keep your license_id and user_id safe.',
    })


def _register_transfer(user_id, agent_type, agent_version, machine_id,
                        old_license_id, old_user_id, new_license_id, now):
    table_name = os.environ['LICENSE_TABLE']
    table = dynamodb.Table(table_name)

    # Verify old license exists, is active, and belongs to old_user_id
    old_item = table.get_item(Key={'license_id': old_license_id}).get('Item')
    if not old_item:
        return _resp(404, {'error': 'Old license not found'})
    if not old_item.get('active'):
        return _resp(404, {'error': 'Old license is already inactive'})
    if old_item.get('user_id') != old_user_id:
        return _resp(403, {'error': 'old_user_id does not match the license record'})

    # Increment total_count for sequential id; active_count stays the same (one in, one out)
    counter_resp = table.update_item(
        Key={'license_id': 'COUNTER'},
        UpdateExpression='ADD total_count :one',
        ExpressionAttributeValues={':one': 1},
        ReturnValues='UPDATED_NEW',
    )
    new_id = int(counter_resp['Attributes'].get('total_count', 1))

    # Deactivate old license atomically (ConditionExpression prevents double-deactivation)
    # 'active' is a DynamoDB reserved word — use #act alias
    try:
        table.update_item(
            Key={'license_id': old_license_id},
            UpdateExpression='SET #act = :false',
            ConditionExpression='#act = :true AND user_id = :uid',
            ExpressionAttributeNames={'#act': 'active'},
            ExpressionAttributeValues={':false': False, ':true': True, ':uid': old_user_id},
        )
    except ClientError as e:
        if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
            return _resp(403, {'error': 'License transfer failed — old license may already be inactive'})
        raise

    # Create new license (old is already deactivated at this point)
    table.put_item(Item={
        'license_id': new_license_id,
        'id': new_id,
        'user_id': user_id,
        'agent_type': agent_type,
        'agent_version': agent_version,
        'machine_id': machine_id,
        'created_date': now,
        'last_used_date': now,
        'active': True,
    })

    print(f"Transferred license from {old_license_id} to {new_license_id} for user {user_id}")
    return _resp(200, {
        'license_id': new_license_id,
        'user_id': user_id,
        'message': 'License transferred successfully. Old license has been deactivated.',
    })


# ---------------------------------------------------------------------------
# Sync
# ---------------------------------------------------------------------------

def _sync(body: dict) -> dict:
    license_id = (body.get('license_id') or '').strip()
    machine_id = (body.get('machine_id') or '').strip()

    if not license_id:
        return _resp(400, {'error': 'license_id is required'})
    if not machine_id:
        return _resp(400, {'error': 'machine_id is required'})

    table_name = os.environ['LICENSE_TABLE']
    table = dynamodb.Table(table_name)
    item = table.get_item(Key={'license_id': license_id}).get('Item')

    if not item:
        return _resp(404, {'error': 'License not found'})
    if not item.get('active'):
        return _resp(403, {'error': 'License is inactive. Re-register to obtain a new license.'})
    if item.get('machine_id') != machine_id:
        return _resp(403, {'error': 'machine_id does not match the license record. '
                                    'To use this license on a new host, perform a license transfer.'})

    now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    update_expr = 'SET last_used_date = :now'
    expr_values = {':now': now}

    # Agents report what they have applied so the fleet console can show it
    applied_versions = body.get('applied_versions')
    if isinstance(applied_versions, dict) and applied_versions:
        update_expr += ', applied_versions = :av'
        expr_values[':av'] = {str(k): str(v) for k, v in applied_versions.items()}
    agent_version = (body.get('agent_version') or '').strip()
    if agent_version:
        update_expr += ', agent_version = :agv'
        expr_values[':agv'] = agent_version

    table.update_item(
        Key={'license_id': license_id},
        UpdateExpression=update_expr,
        ExpressionAttributeValues=expr_values,
    )

    assistants = _get_assistants()
    files = _generate_presigned_urls('claude-code') if assistants.get('claude-code') else {}
    bundles = _get_bundles(assistants)
    print(f"Sync for license {license_id}: {len(files)} legacy URLs, "
          f"{len(bundles)} bundle(s)")
    return _resp(200, {'files': files, 'assistants': assistants, 'bundles': bundles})


def _generate_presigned_urls(assistant: str) -> dict:
    dist_bucket = os.environ['DIST_BUCKET']
    prefix = f'{assistant}/latest/'
    files = {}
    paginator = s3_client.get_paginator('list_objects_v2')
    for page in paginator.paginate(Bucket=dist_bucket, Prefix=prefix):
        for obj in page.get('Contents', []):
            key = obj['Key']
            relative = key[len(prefix):]
            if not relative:
                continue
            url = s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': dist_bucket, 'Key': key},
                ExpiresIn=PRESIGNED_EXPIRY,
            )
            files[relative] = url
    return files


def _get_bundles(assistants: dict) -> dict:
    """Per-assistant bundle manifests: presigned latest/ files + build version.

    Only enabled generatable assistants with files in latest/ appear. Version
    comes from the newest build record; absent builds table means no version."""
    bundles = {}
    for assistant in GENERATABLE_ASSISTANTS:
        if not assistants.get(assistant):
            continue
        files = _generate_presigned_urls(assistant)
        if not files:
            continue
        bundles[assistant] = {
            'version': _latest_build_version(assistant),
            'files': files,
        }
    return bundles


def _latest_build_version(assistant: str) -> str:
    table_name = os.environ.get('BUILDS_TABLE')
    if not table_name:
        return ''
    try:
        resp = dynamodb.Table(table_name).query(
            KeyConditionExpression=Key('assistant').eq(assistant),
            ScanIndexForward=False,
            Limit=1,
        )
        items = resp.get('Items', [])
        return str(items[0]['version']) if items else ''
    except Exception as e:
        print(f"Warning: could not read latest build for {assistant}: {e}")
        return ''


def _get_assistants() -> dict:
    """Per-assistant enforcement toggles from the documents table SETTINGS item.

    Fail-open to defaults (claude-code on) when the env var, table, or item is
    missing — mirrors config-generator's _generation_enabled."""
    table_name = os.environ.get('DOCUMENTS_TABLE')
    if not table_name:
        return dict(DEFAULT_ASSISTANTS)
    try:
        item = dynamodb.Table(table_name).get_item(Key={'id': 'SETTINGS'}).get('Item')
    except Exception as e:
        print(f"Warning: could not read SETTINGS ({e}) — returning default assistants")
        return dict(DEFAULT_ASSISTANTS)
    stored = (item or {}).get('assistants') or {}
    return {name: bool(stored.get(name, DEFAULT_ASSISTANTS[name])) for name in KNOWN_ASSISTANTS}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_max_licenses() -> int:
    secret_arn = os.environ['CONFIG_SECRET_ARN']
    try:
        resp = sm_client.get_secret_value(SecretId=secret_arn)
        secret = json.loads(resp['SecretString'])
        return int(secret.get('max_licenses', 250))
    except Exception as e:
        print(f"Warning: could not read max_licenses from Secrets Manager ({e}), defaulting to 250")
        return 250


def _resp(status: int, body: dict) -> dict:
    return {
        'statusCode': status,
        'headers': {'Content-Type': 'application/json'},
        'body': json.dumps(body, separators=(',', ':')),
    }
