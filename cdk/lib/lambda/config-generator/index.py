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

SYSTEM_PROMPT = """You are an expert at converting enterprise AI governance documents into Claude Code configuration bundles.

Given one or more enforcement documents, generate a JSON object that defines the complete .claude/ directory:

{
  "files": {
    "CLAUDE.md": "<combined mandatory instructions — all rules rewritten in imperative 'You MUST/NEVER' language that Claude will follow every session>",
    "settings.json": "<Claude Code settings JSON string — use {} if no specific settings are warranted>",
    "skills/NAME.md": "<a reusable skill — only include if the enforcement docs define a distinct repeatable behavior worth encapsulating as a skill>",
    "commands/NAME.md": "<a slash command — only include if there is a clear audit or check workflow a developer would want to invoke on-demand>"
  },
  "version": "<YYYY-MM-DD>"
}

## What belongs where

**CLAUDE.md** — Everything Claude must always do or never do. Combine ALL rules from ALL documents into one comprehensive, non-redundant instruction set. Write in second person imperative: "You MUST...", "NEVER...".

**settings.json** — Only Claude Code-compatible keys. Valid examples: `{"env": {"ENFORCE_STANDARDS": "1"}}`. Use `{}` if nothing specific is needed. Must be valid JSON (not a string).

**skills/** — Create a skill file when the docs define a substantial, reusable behavior that is best invoked on-demand rather than always-on. Examples:
  - `skills/sql-safety-check.md` — if docs have detailed SQL injection prevention rules
  - `skills/docstring-enforcer.md` — if docs mandate a specific documentation format
  - `skills/container-security-audit.md` — if docs have container hardening rules
  Name skills descriptively (kebab-case). Don't create trivial skills for one-liners.

**commands/** — Create a slash command when docs imply a workflow a dev would want to run interactively. Examples:
  - `commands/compliance-check.md` — audit current file against all standards
  - `commands/security-review.md` — dedicated security pass
  - `commands/add-docstrings.md` — retrofit missing docstrings
  Name commands as actions (kebab-case verbs).

## Rules
- Return ONLY valid JSON. No markdown fencing, no prose outside the JSON.
- Merge overlapping rules from multiple documents — do not repeat the same rule.
- CLAUDE.md must be comprehensive enough to stand alone as the complete rule set.
- settings.json value must be a JSON object (not a string).
- Each skill/command file should be self-contained with a clear description at the top."""


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


def _write_bundle(files: dict, version: str) -> None:
    """Write each generated file to both versioned and latest paths in dist bucket."""
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
