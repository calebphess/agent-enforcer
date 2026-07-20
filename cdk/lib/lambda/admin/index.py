"""
Admin Lambda — Agent Enforcer web console backend

Serves the /admin/* routes of the HTTP API for the static admin UI:

  POST   /admin/login                       — username/password → signed session token
  GET    /admin/documents                   — list tracked enforcement documents
  POST   /admin/documents                   — create document + presigned upload URL
  PUT    /admin/documents/{id}              — update name/description
  DELETE /admin/documents/{id}              — soft delete + remove source object
  POST   /admin/documents/{id}/upload-url   — fresh presigned PUT (re-upload)
  POST   /admin/documents/{id}/download-url — presigned GET on the source doc
  GET    /admin/stats                       — dashboard counters
  GET    /admin/agents                      — registered agents (license registry)
  DELETE /admin/agents/{id}                 — deregister agent (release license)
  GET    /admin/assistants                  — per-assistant generation toggles
  PUT    /admin/assistants                  — update toggles
  GET    /admin/assistants/{assistant}/bundle          — list generated bundle files
  GET    /admin/assistants/{assistant}/bundle/{path+}  — read one bundle file

Auth: admin_username/admin_password come from the config secret, defaulting to
admin/password when the keys are absent (the deployed secret never picks up
generateSecretString template changes, so defaults must live here). Tokens are
HMAC-SHA256 signed with admin_session_secret if present, else a key derived
from the credentials — changing the password invalidates outstanding tokens.
Dev-grade auth by design.

Environment variables are read at handler call time (not import time) so that
tests can inject mocked values without import-order issues.
"""
import base64
import hashlib
import hmac
import json
import os
import time
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from urllib.parse import unquote

import boto3
from botocore.exceptions import ClientError

dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')
sm_client = boto3.client('secretsmanager')

PRESIGNED_EXPIRY = 600      # 10 minutes
TOKEN_TTL = 43200           # 12 hours
SETTINGS_ID = 'SETTINGS'
KNOWN_ASSISTANTS = ('claude-code', 'kiro', 'cursor', 'github-copilot')
DEFAULT_ASSISTANTS = {name: (name == 'claude-code') for name in KNOWN_ASSISTANTS}


def handler(event: dict, context: Any) -> dict:
    route = event.get('routeKey', '')
    try:
        body = json.loads(event.get('body') or '{}')
    except json.JSONDecodeError:
        return _resp(400, {'error': 'Invalid JSON body'})

    if route == 'POST /admin/login':
        return _login(body)

    username = _verify_token(event)
    if not username:
        return _resp(401, {'error': 'Missing or invalid authorization token'})

    params = event.get('pathParameters') or {}
    doc_id = params.get('id', '')

    if route == 'GET /admin/documents':
        return _list_documents()
    if route == 'POST /admin/documents':
        return _create_document(body, username)
    if route == 'PUT /admin/documents/{id}':
        return _update_document(doc_id, body, username)
    if route == 'DELETE /admin/documents/{id}':
        return _delete_document(doc_id, username)
    if route == 'POST /admin/documents/{id}/upload-url':
        return _document_upload_url(doc_id)
    if route == 'POST /admin/documents/{id}/download-url':
        return _document_download_url(doc_id)
    if route == 'GET /admin/stats':
        return _stats()
    if route == 'GET /admin/agents':
        return _agents()
    if route == 'DELETE /admin/agents/{id}':
        return _deregister_agent(doc_id)
    if route == 'GET /admin/assistants':
        return _resp(200, {'assistants': _read_assistants()})
    if route == 'PUT /admin/assistants':
        return _put_assistants(body)
    if route == 'GET /admin/assistants/{assistant}/bundle':
        return _bundle_list(params.get('assistant', ''))
    if route == 'GET /admin/assistants/{assistant}/bundle/{path+}':
        return _bundle_file(params.get('assistant', ''), params.get('path', ''))

    return _resp(404, {'error': f'Unknown route: {route}'})


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

def _admin_config() -> dict:
    try:
        resp = sm_client.get_secret_value(SecretId=os.environ['CONFIG_SECRET_ARN'])
        return json.loads(resp['SecretString'])
    except Exception as e:
        print(f"Warning: could not read config secret ({e}), using defaults")
        return {}


def _signing_key(config: dict) -> bytes:
    session_secret = config.get('admin_session_secret')
    if session_secret:
        return session_secret.encode('utf-8')
    username = config.get('admin_username', 'admin')
    password = config.get('admin_password', 'password')
    return hashlib.sha256(f'agent-enforcer:{username}:{password}'.encode('utf-8')).digest()


def _login(body: dict) -> dict:
    username = (body.get('username') or '').strip()
    password = body.get('password') or ''
    if not username or not password:
        return _resp(400, {'error': 'username and password are required'})

    config = _admin_config()
    expected_user = config.get('admin_username', 'admin')
    expected_pass = config.get('admin_password', 'password')

    user_ok = hmac.compare_digest(username.encode(), expected_user.encode())
    pass_ok = hmac.compare_digest(password.encode(), expected_pass.encode())
    if not (user_ok and pass_ok):
        return _resp(401, {'error': 'Invalid username or password'})

    exp = int(time.time()) + TOKEN_TTL
    payload = _b64url_encode(json.dumps({'u': username, 'exp': exp}, separators=(',', ':')))
    signature = hmac.new(_signing_key(config), payload.encode(), hashlib.sha256).hexdigest()
    return _resp(200, {
        'token': f'{payload}.{signature}',
        'expires_at': datetime.fromtimestamp(exp, timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'username': username,
    })


def _verify_token(event: dict) -> str:
    headers = event.get('headers') or {}
    auth = headers.get('authorization') or headers.get('Authorization') or ''
    if not auth.startswith('Bearer '):
        return ''
    token = auth[len('Bearer '):].strip()
    if '.' not in token:
        return ''
    payload, signature = token.rsplit('.', 1)

    expected = hmac.new(_signing_key(_admin_config()), payload.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        return ''

    try:
        claims = json.loads(_b64url_decode(payload))
    except (ValueError, json.JSONDecodeError):
        return ''
    if int(claims.get('exp', 0)) < time.time():
        return ''
    return claims.get('u', '')


def _b64url_encode(raw: str) -> str:
    return base64.urlsafe_b64encode(raw.encode('utf-8')).decode('ascii').rstrip('=')


def _b64url_decode(encoded: str) -> str:
    padded = encoded + '=' * (-len(encoded) % 4)
    return base64.urlsafe_b64decode(padded.encode('ascii')).decode('utf-8')


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------

def _documents_table():
    return dynamodb.Table(os.environ['DOCUMENTS_TABLE'])


def _scan_documents() -> list:
    table = _documents_table()
    items = []
    kwargs = {}
    while True:
        page = table.scan(**kwargs)
        items.extend(i for i in page.get('Items', []) if i.get('id') != SETTINGS_ID)
        if 'LastEvaluatedKey' not in page:
            break
        kwargs['ExclusiveStartKey'] = page['LastEvaluatedKey']
    return items


def _list_documents() -> dict:
    items = sorted(_scan_documents(), key=lambda i: i.get('created', ''), reverse=True)
    return _resp(200, {'documents': _clean(items)})


def _create_document(body: dict, username: str) -> dict:
    name = (body.get('name') or '').strip()
    description = (body.get('description') or '').strip()
    filename = os.path.basename((body.get('filename') or '').strip())

    if not name:
        return _resp(400, {'error': 'name is required'})
    if not filename or filename.startswith('.') or not filename.lower().endswith('.md'):
        return _resp(400, {'error': 'filename must be a .md file'})

    for existing in _scan_documents():
        if existing.get('filename') == filename and not existing.get('deleted'):
            return _resp(409, {
                'error': f'A document already tracks {filename}',
                'detail': 'Use its re-upload action to replace the file, or delete it first.',
            })

    now = _now()
    item = {
        'id': str(uuid.uuid4()),
        'name': name,
        'description': description,
        'filename': filename,
        'created': now,
        'updated': now,
        'deleted': None,
        '_version': 1,
        'created_by': username,
        'updated_by': username,
    }
    _documents_table().put_item(Item=item)
    print(f"Document {item['id']} created for {filename} by {username}")
    return _resp(200, {
        'document': _clean(item),
        'upload_url': _presigned_put(filename),
        'upload_expires_in': PRESIGNED_EXPIRY,
    })


def _update_document(doc_id: str, body: dict, username: str) -> dict:
    table = _documents_table()
    item = table.get_item(Key={'id': doc_id}).get('Item')
    if not item or item.get('id') == SETTINGS_ID:
        return _resp(404, {'error': 'Document not found'})

    if 'name' in body:
        name = (body.get('name') or '').strip()
        if not name:
            return _resp(400, {'error': 'name cannot be empty'})
        item['name'] = name
    if 'description' in body:
        item['description'] = (body.get('description') or '').strip()

    item['updated'] = _now()
    item['updated_by'] = username
    item['_version'] = int(item.get('_version', 0)) + 1
    table.put_item(Item=item)
    return _resp(200, {'document': _clean(item)})


def _delete_document(doc_id: str, username: str) -> dict:
    table = _documents_table()
    item = table.get_item(Key={'id': doc_id}).get('Item')
    if not item or item.get('id') == SETTINGS_ID:
        return _resp(404, {'error': 'Document not found'})

    now = _now()
    item['deleted'] = now
    item['updated'] = now
    item['updated_by'] = username
    item['_version'] = int(item.get('_version', 0)) + 1
    table.put_item(Item=item)

    # Removing the source object triggers bundle regeneration without this doc
    filename = item.get('filename', '')
    if filename:
        s3_client.delete_object(Bucket=os.environ['SOURCE_BUCKET'], Key=filename)
        print(f"Document {doc_id} soft-deleted by {username}; removed s3 object {filename}")
    return _resp(200, {'document': _clean(item)})


def _document_upload_url(doc_id: str) -> dict:
    item = _documents_table().get_item(Key={'id': doc_id}).get('Item')
    if not item or item.get('id') == SETTINGS_ID or item.get('deleted'):
        return _resp(404, {'error': 'Document not found'})
    return _resp(200, {
        'upload_url': _presigned_put(item['filename']),
        'upload_expires_in': PRESIGNED_EXPIRY,
    })


def _document_download_url(doc_id: str) -> dict:
    item = _documents_table().get_item(Key={'id': doc_id}).get('Item')
    if not item or item.get('id') == SETTINGS_ID or item.get('deleted'):
        return _resp(404, {'error': 'Document not found'})
    url = s3_client.generate_presigned_url(
        'get_object',
        Params={'Bucket': os.environ['SOURCE_BUCKET'], 'Key': item['filename']},
        ExpiresIn=PRESIGNED_EXPIRY,
    )
    return _resp(200, {'download_url': url})


def _presigned_put(filename: str) -> str:
    return s3_client.generate_presigned_url(
        'put_object',
        Params={'Bucket': os.environ['SOURCE_BUCKET'], 'Key': filename},
        ExpiresIn=PRESIGNED_EXPIRY,
    )


# ---------------------------------------------------------------------------
# Stats + agents
# ---------------------------------------------------------------------------

def _stats() -> dict:
    license_table = dynamodb.Table(os.environ['LICENSE_TABLE'])
    counter = license_table.get_item(Key={'license_id': 'COUNTER'}).get('Item') or {}

    config = _admin_config()
    try:
        max_licenses = int(config.get('max_licenses', 250))
    except (TypeError, ValueError):
        max_licenses = 250

    documents = [i for i in _scan_documents() if not i.get('deleted')]
    assistants = _read_assistants()

    return _resp(200, {
        'active_licenses': int(counter.get('active_count', 0)),
        'total_licenses': int(counter.get('total_count', 0)),
        'max_licenses': max_licenses,
        'documents': len(documents),
        'assistants_enabled': sum(1 for enabled in assistants.values() if enabled),
    })


def _agents() -> dict:
    table = dynamodb.Table(os.environ['LICENSE_TABLE'])
    agents = []
    kwargs = {}
    while True:
        page = table.scan(**kwargs)
        for item in page.get('Items', []):
            if item.get('license_id') == 'COUNTER':
                continue
            # license_id/machine_id stay server-side — they are the sync credential
            agents.append({
                'id': int(item.get('id', 0)),
                'user_id': item.get('user_id', ''),
                'agent_type': item.get('agent_type', ''),
                'agent_version': item.get('agent_version', ''),
                'created_date': item.get('created_date', ''),
                'last_used_date': item.get('last_used_date', ''),
                'active': bool(item.get('active', False)),
            })
        if 'LastEvaluatedKey' not in page:
            break
        kwargs['ExclusiveStartKey'] = page['LastEvaluatedKey']

    agents.sort(key=lambda a: a.get('last_used_date', ''), reverse=True)
    return _resp(200, {'agents': agents, 'count': len(agents)})


def _deregister_agent(id_str: str) -> dict:
    try:
        agent_id = int(id_str)
    except (TypeError, ValueError):
        return _resp(404, {'error': 'Agent not found'})

    table = dynamodb.Table(os.environ['LICENSE_TABLE'])
    record = None
    kwargs = {}
    while record is None:
        page = table.scan(**kwargs)
        for item in page.get('Items', []):
            if item.get('license_id') == 'COUNTER':
                continue
            if 'id' in item and int(item['id']) == agent_id:
                record = item
                break
        if 'LastEvaluatedKey' not in page:
            break
        kwargs['ExclusiveStartKey'] = page['LastEvaluatedKey']

    if not record or not record.get('active'):
        return _resp(404, {'error': 'Agent not found or already deregistered'})

    # Deactivate atomically — same #act alias + condition as the license
    # Lambda's transfer path ('active' is a DynamoDB reserved word)
    try:
        table.update_item(
            Key={'license_id': record['license_id']},
            UpdateExpression='SET #act = :false',
            ConditionExpression='#act = :true',
            ExpressionAttributeNames={'#act': 'active'},
            ExpressionAttributeValues={':false': False, ':true': True},
        )
    except ClientError as e:
        if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
            return _resp(404, {'error': 'Agent not found or already deregistered'})
        raise

    # Release the license slot; conditional floor keeps the counter at >= 0
    # even if counts ever drift
    try:
        table.update_item(
            Key={'license_id': 'COUNTER'},
            UpdateExpression='ADD active_count :neg',
            ConditionExpression='active_count >= :one',
            ExpressionAttributeValues={':neg': -1, ':one': 1},
        )
    except ClientError as e:
        if e.response['Error']['Code'] != 'ConditionalCheckFailedException':
            raise

    print(f"Agent {agent_id} deregistered; license {record['license_id']} deactivated")
    return _resp(200, {'id': agent_id})


# ---------------------------------------------------------------------------
# Bundle inspection — generated configs under <assistant>/latest/ in the
# dist bucket
# ---------------------------------------------------------------------------

def _bundle_list(assistant: str) -> dict:
    if assistant not in KNOWN_ASSISTANTS:
        return _resp(404, {'error': f'Unknown assistant: {assistant}'})

    prefix = f'{assistant}/latest/'
    files = []
    kwargs = {'Bucket': os.environ['DIST_BUCKET'], 'Prefix': prefix}
    while True:
        page = s3_client.list_objects_v2(**kwargs)
        for obj in page.get('Contents', []):
            rel = obj['Key'][len(prefix):]
            if not rel:
                continue
            files.append({
                'path': rel,
                'size': int(obj['Size']),
                'updated': obj['LastModified'].strftime('%Y-%m-%dT%H:%M:%SZ'),
            })
        if not page.get('IsTruncated'):
            break
        kwargs['ContinuationToken'] = page['NextContinuationToken']

    files.sort(key=lambda f: f['path'])
    return _resp(200, {'assistant': assistant, 'files': files})


def _bundle_file(assistant: str, file_path: str) -> dict:
    if assistant not in KNOWN_ASSISTANTS:
        return _resp(404, {'error': f'Unknown assistant: {assistant}'})

    # The UI percent-encodes the path and HTTP API %2F decoding has varied
    # across gateway types — unquote is idempotent here (bundle filenames
    # never contain '%')
    file_path = unquote(file_path or '')
    if not file_path or file_path.startswith('/') or '..' in file_path.split('/'):
        return _resp(404, {'error': 'Bundle file not found'})

    try:
        obj = s3_client.get_object(
            Bucket=os.environ['DIST_BUCKET'],
            Key=f'{assistant}/latest/{file_path}',
        )
    except s3_client.exceptions.NoSuchKey:
        return _resp(404, {'error': 'Bundle file not found'})
    content = obj['Body'].read().decode('utf-8', errors='replace')
    return _resp(200, {'path': file_path, 'content': content})


# ---------------------------------------------------------------------------
# Assistant toggles
# ---------------------------------------------------------------------------

def _read_assistants() -> dict:
    item = _documents_table().get_item(Key={'id': SETTINGS_ID}).get('Item')
    stored = (item or {}).get('assistants') or {}
    return {name: bool(stored.get(name, DEFAULT_ASSISTANTS[name])) for name in KNOWN_ASSISTANTS}


def _put_assistants(body: dict) -> dict:
    updates = body.get('assistants')
    if not isinstance(updates, dict) or not updates:
        return _resp(400, {'error': 'assistants object is required'})

    unknown = sorted(set(updates) - set(KNOWN_ASSISTANTS))
    if unknown:
        return _resp(400, {'error': f'Unknown assistants: {", ".join(unknown)}'})
    if not all(isinstance(v, bool) for v in updates.values()):
        return _resp(400, {'error': 'assistant values must be booleans'})

    assistants = _read_assistants()
    assistants.update(updates)
    _documents_table().put_item(Item={'id': SETTINGS_ID, 'assistants': assistants})
    print(f"Assistant toggles updated: {assistants}")
    return _resp(200, {'assistants': assistants})


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def _clean(obj):
    """DynamoDB returns numbers as Decimal — make them JSON-serializable."""
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_clean(v) for v in obj]
    return obj


def _resp(status: int, body: dict) -> dict:
    return {
        'statusCode': status,
        'headers': {'Content-Type': 'application/json'},
        'body': json.dumps(body, separators=(',', ':')),
    }
