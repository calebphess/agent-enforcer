"""
Config Generator Lambda

Triggered by any S3 PUT or delete on the enforcement-source bucket.
Reads ALL enforcement documents (.md and .pdf) from that bucket, combines
them into a single context, then calls Bedrock to generate a configuration
bundle per enabled assistant:

  claude-code/  CLAUDE.md, settings.json, skills/*.md, commands/*.md
  cursor/       AGENTS.md (single lean rules file — cursor has no lazy loading)

Each generation run is stamped with an epoch-millisecond version. Bundles are
written to <assistant>/<version>/ AND <assistant>/latest/ (always overwritten),
zipped to zips/<assistant>.<version>.zip, and recorded in the builds table
(PK assistant, SK version) with the source docs + ETags that went in.

PDFs are distilled before synthesis: pypdf text extraction, chunked map-reduce
through a fast model that keeps ONLY software-development-relevant rules, with
the distilled text cached in the dist bucket keyed by source ETag.

Deleting the last source document clears every assistant's latest/ prefix so
no stale bundle lives on.
"""
import io
import json
import os
import time
import uuid
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from urllib.parse import unquote_plus

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError

s3 = boto3.client('s3')
# Long-form synthesis can stream for several minutes — botocore's default
# 60s read timeout kills it mid-generation (ReadTimeoutError). Retries stay
# off here; _invoke_model handles backoff itself.
bedrock = boto3.client(
    'bedrock-runtime',
    region_name=os.environ.get('AWS_REGION', 'us-east-1'),
    config=BotoConfig(read_timeout=840, connect_timeout=10, retries={'max_attempts': 0}),
)
dynamodb = boto3.resource('dynamodb')

DIST_BUCKET = os.environ['DIST_BUCKET']
BEDROCK_MODEL_ID = os.environ['BEDROCK_MODEL_ID']
BEDROCK_HAIKU_MODEL_ID = os.environ.get('BEDROCK_HAIKU_MODEL_ID', BEDROCK_MODEL_ID)

# Assistants with a working generation pipeline. The admin UI knows more
# (kiro, github-copilot) but those toggles gate nothing until a pipeline lands.
GENERATABLE_ASSISTANTS = ('claude-code', 'cursor')
DEFAULT_ASSISTANTS = {'claude-code': True, 'cursor': False}

SOURCE_EXTENSIONS = ('.md', '.pdf')

# A UI-managed upload writes its registry record moments before the S3 event
# lands — don't double-bump a record that fresh.
REGISTRY_GRACE_SECONDS = 120

# PDF distillation
DISTILL_CHUNK_CHARS = 40_000
DISTILL_MAX_WORKERS = 4
DISTILL_MAX_TOKENS = 2048
NOTHING_RELEVANT = 'NOTHING_RELEVANT'

BEDROCK_RETRIES = 5

SYSTEM_PROMPT = """You are an expert at converting enterprise AI governance documents into efficient Claude Code configuration bundles.

## How Claude Code loads configuration — read this carefully

- **CLAUDE.md** is injected into the system prompt on EVERY turn of EVERY session. Every word costs tokens on every API call. It must be under 200 words.
- **Skills** (`.claude/skills/<name>.md`) are loaded ONLY when invoked. They are the right place for detailed, domain-specific rule sets. Reference them from CLAUDE.md with trigger lines.
- **Commands** (`.claude/commands/<name>.md`) are user-invoked slash commands. Use for audit/check workflows a developer explicitly triggers.
- **settings.json** controls Claude Code behavior flags (permissions, env vars, hooks).

## Allocation rules — follow exactly

**CLAUDE.md** contains TWO things only:
1. A short header (1–2 sentences about the enforcement policy)
2. One trigger line per skill, telling Claude when to load it

CLAUDE.md must be under 100 words total. It does NOT contain the actual rules — those live in skills.

**WRONG** (do not do this):
```
CLAUDE.md:
You MUST use parameterized queries for all SQL...
You MUST run Dockerfiles as non-root...
When writing SQL, invoke the `sql-safety` skill.
```

**RIGHT** (the rules belong only in the skill, not in CLAUDE.md too):
```
CLAUDE.md:
You are operating under enterprise coding and security enforcement. Follow these standards:
- When writing or editing any code, invoke the `python-standards` skill first.
- When writing SQL or database code, invoke the `sql-safety` skill.
- When writing a Dockerfile or container config, invoke the `container-security` skill.
```

**Skills** contain the actual rules — verbose, detailed, domain-specific. They are only loaded when Claude invokes them based on the trigger in CLAUDE.md. Each skill should be comprehensive for its domain.

**Commands** are user-triggered slash commands for audit/review workflows (e.g., "audit my code against standards"). Create one command that covers the full compliance check across all skills.

## Skill trigger syntax

Triggers in CLAUDE.md follow this pattern:
  When [condition], invoke the `skill-name` skill.

Good trigger conditions:
  "when writing or editing any code"
  "when writing SQL queries or database access code"
  "when creating or modifying a Dockerfile or container configuration"
  "when creating a new Python module or file"

## Output format

Return a single JSON object. No markdown fencing, no prose outside the JSON.

{
  "files": {
    "CLAUDE.md": "<under 100 words; header sentence + one trigger line per skill only — NO actual rules>",
    "settings.json": <JSON object — not a string; use {} if nothing specific is needed>,
    "skills/NAME.md": "<all the actual rules for this domain; self-contained; one-line description at top>",
    "commands/NAME.md": "<user-invokable audit workflow covering all skills; one-line description at top>"
  },
  "version": "<YYYY-MM-DD>"
}

## Constraints
- Return ONLY valid JSON. No markdown fencing, no prose outside the JSON.
- CLAUDE.md must be under 100 words and contain NO actual rules — only triggers.
- Merge overlapping rules across documents into skills — no repetition.
- settings.json must be a JSON object (not a string).
- Skills are self-contained — a developer can read them without seeing CLAUDE.md.
- Every skill and command file MUST end with a line `Sources: <document names>`
  listing which source enforcement documents its rules came from, so auditors
  can trace each rule set back to policy."""

CURSOR_SYSTEM_PROMPT = """You are an expert at converting enterprise AI governance documents into a Cursor rules bundle.

## How Cursor loads rules — read this carefully

Cursor reads two things from a workspace:
- **AGENTS.md** at the workspace root — always in context, every word costs
  tokens on every request. Terseness is mandatory: under 300 words.
- **.cursor/rules/*.mdc** files — scoped rule files with YAML frontmatter.
  `alwaysApply: false` rules load only when their description matches the
  task, so they are the right place for detailed domain rule sets (like
  Claude Code skills).

## Allocation rules — follow exactly

**AGENTS.md** contains ONLY the always-on essentials: a one-line enforcement
header and the handful of universal rules (secrets, injection, validation).
Under 300 words. First line must be exactly:
<!-- managed by agent-enforcer -->

**.cursor/rules/NAME.mdc** files carry the detailed, domain-specific rules —
one file per domain (e.g. secure-development, database-security,
container-security). Each starts with YAML frontmatter:

---
description: <when these rules apply, one line>
alwaysApply: false
---
<!-- managed by agent-enforcer -->

then the full rules for that domain. Every .mdc file MUST end with a line
`Sources: <document names>` listing which source enforcement documents its
rules came from.

## Output format

Return a single JSON object. No markdown fencing, no prose outside the JSON.

{
  "files": {
    "AGENTS.md": "<always-on essentials, first line the managed marker, under 300 words>",
    ".cursor/rules/NAME.mdc": "<frontmatter + managed marker + domain rules + Sources line>"
  },
  "version": "<YYYY-MM-DD>"
}"""

DISTILL_SYSTEM_PROMPT = """You extract software-development rules from compliance and governance documents.

From the document excerpt provided, extract ONLY rules that are directly
relevant to writing, reviewing, testing, or securing software code — coding
standards, secure development practices, input validation, cryptography usage,
error handling, dependency and supply-chain requirements, developer testing,
CI/CD and configuration management requirements.

IGNORE everything else: physical security, personnel, facilities, incident
response process, awareness training, audit logistics, policy administration.

Output terse markdown bullets, one rule per line, no headers, no commentary.
If the excerpt contains nothing relevant to software development, output
exactly: NOTHING_RELEVANT"""

CURSOR_MANAGED_MARKER = '<!-- managed by agent-enforcer -->'


def handler(event, context):
    """Process a source bucket event by regenerating bundles for every enabled assistant."""
    # All records in the event share the same source bucket
    source_bucket = event['Records'][0]['s3']['bucket']['name']
    trigger_key = unquote_plus(event['Records'][0]['s3']['object']['key'])
    print(f"Triggered by event on '{trigger_key}' in {source_bucket}")

    # Registry bookkeeping happens regardless of generation toggles
    _register_documents(event)

    enabled = [a for a in GENERATABLE_ASSISTANTS if _generation_enabled(a)]
    if not enabled:
        print("No generatable assistant is enabled via SETTINGS — skipping")
        return

    docs, doc_meta = _read_all_docs(source_bucket)
    if not docs:
        print("No source documents remain — clearing all latest bundles")
        _clear_all_bundles()
        return

    print(f"Processing {len(docs)} enforcement document(s): {list(docs.keys())}")

    version = str(int(time.time() * 1000))

    for assistant in enabled:
        if assistant == 'claude-code':
            bundle = _call_bedrock(docs)
        else:
            bundle = _call_bedrock(docs, system_prompt=CURSOR_SYSTEM_PROMPT)

        files = bundle.get('files', {})
        if not files:
            print(f"Bedrock returned empty files bundle for {assistant} — skipping")
            continue

        if assistant == 'cursor':
            files = _ensure_cursor_marker(files)

        _write_bundle(assistant, files, version)
        zip_key = _write_zip(assistant, files, version)
        _record_build(assistant, version, doc_meta, sorted(files.keys()), zip_key)
        print(f"{assistant} bundle written: {len(files)} files at version {version}")


# ---------------------------------------------------------------------------
# Documents registry + assistant toggles (admin UI integration)
# ---------------------------------------------------------------------------

def _generation_enabled(assistant: str) -> bool:
    """Fail-open per assistant default: with no table configured, no SETTINGS
    item, or any read error, each assistant falls back to its default
    (claude-code on, cursor off) — the direct `aws s3 cp` flow keeps working."""
    default = DEFAULT_ASSISTANTS.get(assistant, False)
    table_name = os.environ.get('DOCUMENTS_TABLE')
    if not table_name:
        return default
    try:
        item = dynamodb.Table(table_name).get_item(Key={'id': 'SETTINGS'}).get('Item')
    except Exception as e:
        print(f"  Warning: could not read SETTINGS ({e}) — using defaults")
        return default
    if not item:
        return default
    return bool((item.get('assistants') or {}).get(assistant, default))


def _register_documents(event) -> None:
    """Keep the documents registry in step with the bucket: direct uploads
    (aws s3 cp) get a record created for them, re-uploads refresh the existing
    one. Registry trouble never blocks generation."""
    table_name = os.environ.get('DOCUMENTS_TABLE')
    if not table_name:
        return
    table = dynamodb.Table(table_name)

    for record in event.get('Records', []):
        if not record.get('eventName', '').startswith('ObjectCreated'):
            continue  # removals regenerate the bundle but never touch the registry
        key = unquote_plus(record['s3']['object']['key'])
        if not key.lower().endswith(SOURCE_EXTENSIONS):
            continue
        try:
            _upsert_document_record(table, key)
        except Exception as e:
            print(f"  Warning: could not register {key} in documents table: {e}")


def _upsert_document_record(table, key: str) -> None:
    existing = None
    kwargs = {}
    while True:
        page = table.scan(**kwargs)
        for item in page.get('Items', []):
            if item.get('id') != 'SETTINGS' and item.get('filename') == key and not item.get('deleted'):
                existing = item
                break
        if existing or 'LastEvaluatedKey' not in page:
            break
        kwargs['ExclusiveStartKey'] = page['LastEvaluatedKey']

    now = datetime.now(timezone.utc)
    now_str = now.strftime('%Y-%m-%dT%H:%M:%SZ')

    if existing is None:
        basename = os.path.basename(key)
        table.put_item(Item={
            'id': str(uuid.uuid4()),
            'name': os.path.splitext(basename)[0],
            'description': 'Uploaded directly to S3',
            'filename': key,
            'created': now_str,
            'updated': now_str,
            'deleted': None,
            '_version': 1,
            'created_by': 's3-upload',
            'updated_by': 's3-upload',
        })
        print(f"  Registered untracked document {key} in documents table")
        return

    try:
        updated_at = datetime.strptime(
            existing.get('updated', ''), '%Y-%m-%dT%H:%M:%SZ'
        ).replace(tzinfo=timezone.utc)
        if (now - updated_at).total_seconds() < REGISTRY_GRACE_SECONDS:
            return  # tail of a UI-managed upload — record is already current
    except ValueError:
        pass

    existing['updated'] = now_str
    existing['updated_by'] = 's3-upload'
    existing['_version'] = int(existing.get('_version', 0)) + 1
    table.put_item(Item=existing)
    print(f"  Refreshed document record for re-uploaded {key}")


# ---------------------------------------------------------------------------
# Source reading + PDF distillation
# ---------------------------------------------------------------------------

def _read_all_docs(bucket: str):
    """List and read every .md/.pdf file from the source bucket.

    Returns (docs, meta): docs maps key -> text ready for synthesis (PDFs are
    distilled first), meta lists {key, etag} for the build record."""
    docs = {}
    meta = []
    paginator = s3.get_paginator('list_objects_v2')
    for page in paginator.paginate(Bucket=bucket):
        for obj in page.get('Contents', []):
            key = obj['Key']
            if not key.lower().endswith(SOURCE_EXTENSIONS):
                continue
            etag = obj.get('ETag', '').strip('"')
            try:
                if key.lower().endswith('.pdf'):
                    docs[key] = _distilled_pdf_text(bucket, key, etag)
                else:
                    resp = s3.get_object(Bucket=bucket, Key=key)
                    docs[key] = resp['Body'].read().decode('utf-8')
                meta.append({'key': key, 'etag': etag})
                print(f"  Read {key} ({obj['Size']} bytes)")
            except ClientError as e:
                print(f"  Warning: could not read {key}: {e}")
    return docs, meta


def _distilled_pdf_text(bucket: str, key: str, etag: str) -> str:
    """Distill a PDF to software-development-relevant rules, cached by ETag."""
    cache_key = f'distilled/{key}.{etag}.md'
    try:
        cached = s3.get_object(Bucket=DIST_BUCKET, Key=cache_key)
        print(f"  Using cached distillation for {key}")
        return cached['Body'].read().decode('utf-8')
    except ClientError:
        pass

    data = s3.get_object(Bucket=bucket, Key=key)['Body'].read()
    text = _extract_pdf_text(data)
    print(f"  Extracted {len(text)} chars of text from {key}")
    distilled = _distill_text(text, key)
    s3.put_object(
        Bucket=DIST_BUCKET, Key=cache_key,
        Body=distilled.encode('utf-8'), ContentType='text/markdown',
    )
    print(f"  Distilled {key} to {len(distilled)} chars (cached at {cache_key})")
    return distilled


def _extract_pdf_text(data: bytes) -> str:
    from pypdf import PdfReader  # imported lazily — only needed when PDFs exist
    reader = PdfReader(io.BytesIO(data))
    return '\n'.join(page.extract_text() or '' for page in reader.pages)


def _distill_text(text: str, name: str) -> str:
    """Map-reduce: chunk the raw text, keep only software-development rules."""
    chunks = [text[i:i + DISTILL_CHUNK_CHARS] for i in range(0, len(text), DISTILL_CHUNK_CHARS)]
    total = len(chunks)
    print(f"  Distilling {name}: {total} chunk(s)")

    with ThreadPoolExecutor(max_workers=DISTILL_MAX_WORKERS) as pool:
        results = list(pool.map(
            lambda pair: _distill_chunk(pair[1], name, pair[0], total),
            enumerate(chunks, start=1),
        ))

    kept = [r for r in results if r and NOTHING_RELEVANT not in r]
    return '\n'.join(kept)


def _distill_chunk(chunk: str, name: str, index: int, total: int) -> str:
    user_message = (
        f"Document: {name} (part {index} of {total})\n\n"
        f"<excerpt>\n{chunk}\n</excerpt>"
    )
    return _invoke_model(
        BEDROCK_HAIKU_MODEL_ID, DISTILL_SYSTEM_PROMPT, user_message,
        max_tokens=DISTILL_MAX_TOKENS,
    ).strip()


# ---------------------------------------------------------------------------
# Bedrock synthesis
# ---------------------------------------------------------------------------

def _invoke_model(model_id: str, system: str, user_message: str, max_tokens: int = 8192) -> str:
    """Invoke a Bedrock model with retry/backoff on throttling; returns raw text."""
    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": user_message}],
    })

    last_error = None
    for attempt in range(BEDROCK_RETRIES):
        try:
            response = bedrock.invoke_model(
                modelId=model_id,
                body=body,
                contentType='application/json',
                accept='application/json',
            )
            result = json.loads(response['body'].read())
            return result['content'][0]['text']
        except ClientError as e:
            code = e.response.get('Error', {}).get('Code', '')
            if code not in ('ThrottlingException', 'ModelTimeoutException', 'ServiceUnavailableException'):
                raise
            last_error = e
            wait = 2 ** attempt
            print(f"  Bedrock {code} (attempt {attempt + 1}/{BEDROCK_RETRIES}) — retrying in {wait}s")
            time.sleep(wait)
    raise last_error


def _call_bedrock(docs: dict, system_prompt: str = SYSTEM_PROMPT) -> dict:
    """Send all enforcement docs to Bedrock and return the parsed bundle."""
    doc_sections = '\n\n'.join(
        f'<document name="{name}">\n{content}\n</document>'
        for name, content in sorted(docs.items())
    )

    user_message = (
        f"Generate the configuration bundle from these "
        f"{len(docs)} enforcement document(s):\n\n{doc_sections}"
    )

    raw_text = _invoke_model(BEDROCK_MODEL_ID, system_prompt, user_message).strip()

    # Strip accidental markdown fencing
    if raw_text.startswith('```'):
        lines = raw_text.splitlines()
        end = next((i for i in range(len(lines) - 1, 0, -1) if lines[i].strip() == '```'), len(lines))
        raw_text = '\n'.join(lines[1:end])

    return json.loads(raw_text)


def _ensure_cursor_marker(files: dict) -> dict:
    """Guarantee the managed marker appears in every cursor file regardless of
    model output: line 1 of AGENTS.md, just after the YAML frontmatter for
    .mdc rule files. The agent only touches marker-bearing files."""
    out = dict(files)
    for path, content in files.items():
        if not isinstance(content, str) or CURSOR_MANAGED_MARKER in content.split('\n', 6)[:6]:
            continue
        if path == 'AGENTS.md':
            out[path] = f'{CURSOR_MANAGED_MARKER}\n{content}'
        elif path.endswith('.mdc'):
            lines = content.split('\n')
            insert_at = 0
            if lines and lines[0].strip() == '---':
                for i in range(1, len(lines)):
                    if lines[i].strip() == '---':
                        insert_at = i + 1
                        break
            lines.insert(insert_at, CURSOR_MANAGED_MARKER)
            out[path] = '\n'.join(lines)
    return out


# ---------------------------------------------------------------------------
# Bundle output: versioned + latest prefixes, zips, build records
# ---------------------------------------------------------------------------

def _clear_latest(bucket: str, assistant: str) -> None:
    """Delete all existing objects under <assistant>/latest/ before writing a new bundle."""
    paginator = s3.get_paginator('list_objects_v2')
    to_delete = []
    for page in paginator.paginate(Bucket=bucket, Prefix=f'{assistant}/latest/'):
        for obj in page.get('Contents', []):
            to_delete.append({'Key': obj['Key']})
    if to_delete:
        s3.delete_objects(Bucket=bucket, Delete={'Objects': to_delete})
        print(f"  Cleared {len(to_delete)} stale object(s) from {assistant}/latest/")


def _clear_all_bundles() -> None:
    """Last source doc deleted: clear every assistant's latest/ so nothing stale is served."""
    for assistant in GENERATABLE_ASSISTANTS:
        _clear_latest(DIST_BUCKET, assistant)


def _serialize_bundle_file(file_path: str, file_content) -> tuple:
    if isinstance(file_content, dict):
        return json.dumps(file_content, indent=2).encode('utf-8'), 'application/json'
    content_type = 'application/json' if file_path.endswith('.json') else 'text/plain'
    return str(file_content).encode('utf-8'), content_type


def _write_bundle(assistant: str, files: dict, version: str) -> None:
    """Clear latest/, then write each generated file to both versioned and latest paths."""
    _clear_latest(DIST_BUCKET, assistant)

    for file_path, file_content in files.items():
        content_bytes, content_type = _serialize_bundle_file(file_path, file_content)
        for prefix in [f'{assistant}/{version}/', f'{assistant}/latest/']:
            dest = f'{prefix}{file_path}'
            s3.put_object(
                Bucket=DIST_BUCKET,
                Key=dest,
                Body=content_bytes,
                ContentType=content_type,
            )
            print(f"  Wrote s3://{DIST_BUCKET}/{dest}")


def _write_zip(assistant: str, files: dict, version: str) -> str:
    """Zip the bundle in-memory and store it as an immutable versioned artifact."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        for file_path, file_content in sorted(files.items()):
            content_bytes, _ = _serialize_bundle_file(file_path, file_content)
            zf.writestr(file_path, content_bytes)
    zip_key = f'zips/{assistant}.{version}.zip'
    s3.put_object(
        Bucket=DIST_BUCKET, Key=zip_key,
        Body=buffer.getvalue(), ContentType='application/zip',
    )
    print(f"  Wrote s3://{DIST_BUCKET}/{zip_key}")
    return zip_key


def _record_build(assistant: str, version: str, doc_meta: list, file_list: list, zip_key: str) -> None:
    """Record what went into this build. Absent table (or errors) never block generation."""
    table_name = os.environ.get('BUILDS_TABLE')
    if not table_name:
        return
    try:
        dynamodb.Table(table_name).put_item(Item={
            'assistant': assistant,
            'version': version,
            'built_at': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'docs': doc_meta,
            'files': file_list,
            'zip_key': zip_key,
        })
    except Exception as e:
        print(f"  Warning: could not record build {assistant}@{version}: {e}")
