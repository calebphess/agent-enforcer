"""
Config Generator Lambda

Triggered by any S3 PUT on the enforcement-source bucket.
Reads ALL .md enforcement documents from that bucket, combines them into
a single context, then calls Bedrock to generate a unified .claude/
configuration bundle:

  CLAUDE.md                        — combined mandatory rules (imperative)
  settings.json                    — Claude Code settings
  skills/<name>.md                 — reusable behaviors inferred from the docs
  commands/<name>.md               — slash commands for audit/check workflows

Writes the result to enforcement-dist/claude-code/<date>/ AND
enforcement-dist/claude-code/latest/ (always overwritten).

Naming convention for source documents:
  enforcement-doc-core.md          — base org-wide rules (always present)
  enforcement-doc-security.md      — security-specific additions
  enforcement-doc-hipaa.md         — HIPAA compliance additions
  enforcement-doc-coding.md        — language/style additions
  (any *.md file is processed)
"""
import json
import os
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

s3 = boto3.client('s3')
bedrock = boto3.client('bedrock-runtime', region_name=os.environ.get('AWS_REGION', 'us-east-1'))

DIST_BUCKET = os.environ['DIST_BUCKET']
BEDROCK_MODEL_ID = os.environ['BEDROCK_MODEL_ID']

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
- Skills are self-contained — a developer can read them without seeing CLAUDE.md."""


def handler(event, context):
    """Process a source bucket PUT event by regenerating the full .claude/ bundle."""
    # All records in the event share the same source bucket
    source_bucket = event['Records'][0]['s3']['bucket']['name']
    trigger_key = event['Records'][0]['s3']['object']['key']
    print(f"Triggered by upload of '{trigger_key}' to {source_bucket}")

    docs = _read_all_docs(source_bucket)
    if not docs:
        print("No .md files found in source bucket — nothing to generate")
        return

    print(f"Processing {len(docs)} enforcement document(s): {list(docs.keys())}")

    bundle = _call_bedrock(docs)
    version = bundle.get('version', datetime.now(timezone.utc).strftime('%Y-%m-%d'))
    files = bundle.get('files', {})

    if not files:
        print("Bedrock returned empty files bundle — check the prompt output")
        return

    _write_bundle(files, version)
    print(f"Bundle written: {len(files)} files at version {version}")


def _read_all_docs(bucket: str) -> dict:
    """List and read every .md file from the source bucket."""
    docs = {}
    paginator = s3.get_paginator('list_objects_v2')
    for page in paginator.paginate(Bucket=bucket):
        for obj in page.get('Contents', []):
            key = obj['Key']
            if not key.lower().endswith('.md'):
                continue
            try:
                resp = s3.get_object(Bucket=bucket, Key=key)
                docs[key] = resp['Body'].read().decode('utf-8')
                print(f"  Read {key} ({obj['Size']} bytes)")
            except ClientError as e:
                print(f"  Warning: could not read {key}: {e}")
    return docs


def _call_bedrock(docs: dict) -> dict:
    """Send all enforcement docs to Bedrock and return the parsed bundle."""
    doc_sections = '\n\n'.join(
        f'<document name="{name}">\n{content}\n</document>'
        for name, content in sorted(docs.items())
    )

    user_message = (
        f"Generate a Claude Code .claude/ configuration bundle from these "
        f"{len(docs)} enforcement document(s):\n\n{doc_sections}"
    )

    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 8192,
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": user_message}],
    })

    response = bedrock.invoke_model(
        modelId=BEDROCK_MODEL_ID,
        body=body,
        contentType='application/json',
        accept='application/json',
    )

    result = json.loads(response['body'].read())
    raw_text = result['content'][0]['text'].strip()

    # Strip accidental markdown fencing
    if raw_text.startswith('```'):
        lines = raw_text.splitlines()
        end = next((i for i in range(len(lines) - 1, 0, -1) if lines[i].strip() == '```'), len(lines))
        raw_text = '\n'.join(lines[1:end])

    return json.loads(raw_text)


def _clear_latest(bucket: str) -> None:
    """Delete all existing objects under claude-code/latest/ before writing a new bundle."""
    paginator = s3.get_paginator('list_objects_v2')
    to_delete = []
    for page in paginator.paginate(Bucket=bucket, Prefix='claude-code/latest/'):
        for obj in page.get('Contents', []):
            to_delete.append({'Key': obj['Key']})
    if to_delete:
        s3.delete_objects(Bucket=bucket, Delete={'Objects': to_delete})
        print(f"  Cleared {len(to_delete)} stale object(s) from claude-code/latest/")


def _write_bundle(files: dict, version: str) -> None:
    """Clear latest/, then write each generated file to both versioned and latest paths."""
    _clear_latest(DIST_BUCKET)

    for file_path, file_content in files.items():
        if isinstance(file_content, dict):
            content_bytes = json.dumps(file_content, indent=2).encode('utf-8')
            content_type = 'application/json'
        else:
            content_bytes = str(file_content).encode('utf-8')
            content_type = 'application/json' if file_path.endswith('.json') else 'text/plain'

        for prefix in [f'claude-code/{version}/', 'claude-code/latest/']:
            dest = f'{prefix}{file_path}'
            s3.put_object(
                Bucket=DIST_BUCKET,
                Key=dest,
                Body=content_bytes,
                ContentType=content_type,
            )
            print(f"  Wrote s3://{DIST_BUCKET}/{dest}")
