"""
Analysis Lambda

Triggered by S3 PUT on the demo-results bucket (suffix: 'completed').
Waits until both instance1 and instance2 have completed, then reads their
generated project files, runs automated checks, calls Bedrock for narrative
analysis, and writes results.md to the results bucket.
"""
import json
import os
import re

import boto3
from botocore.exceptions import ClientError

s3 = boto3.client('s3')
bedrock = boto3.client('bedrock-runtime', region_name=os.environ.get('AWS_REGION', 'us-east-1'))

RESULTS_BUCKET = os.environ['RESULTS_BUCKET']
BEDROCK_MODEL_ID = os.environ['BEDROCK_MODEL_ID']


def handler(event, context):
    """Generate results.md once both demo instances have completed."""
    # Check both completion markers
    for instance in ('instance1', 'instance2'):
        try:
            s3.head_object(Bucket=RESULTS_BUCKET, Key=f'{instance}/completed')
        except ClientError:
            print(f"{instance} not done yet — deferring analysis")
            return

    # Idempotency: skip if already generated
    try:
        s3.head_object(Bucket=RESULTS_BUCKET, Key='results.md')
        print("results.md already exists — skipping")
        return
    except ClientError:
        pass

    instance1_files = _read_project_files('instance1')
    instance2_files = _read_project_files('instance2')

    metrics1 = _check_patterns(instance1_files)
    metrics2 = _check_patterns(instance2_files)

    meta1 = _read_meta('instance1')
    meta2 = _read_meta('instance2')
    metrics1.update(_token_metrics(meta1))
    metrics2.update(_token_metrics(meta2))

    analysis_text = _call_bedrock(instance1_files, instance2_files, metrics1, metrics2)

    results_md = _build_results_md(metrics1, metrics2, analysis_text)

    s3.put_object(
        Bucket=RESULTS_BUCKET,
        Key='results.md',
        Body=results_md.encode('utf-8'),
        ContentType='text/markdown',
    )
    print(f"Results written to s3://{RESULTS_BUCKET}/results.md")


def _read_project_files(instance_prefix: str) -> dict:
    """Read all project files from an instance's S3 output folder."""
    files = {}
    paginator = s3.get_paginator('list_objects_v2')
    prefix = f'{instance_prefix}/project/'
    for page in paginator.paginate(Bucket=RESULTS_BUCKET, Prefix=prefix):
        for obj in page.get('Contents', []):
            key = obj['Key']
            if obj['Size'] == 0 or obj['Size'] > 100_000:
                continue
            try:
                resp = s3.get_object(Bucket=RESULTS_BUCKET, Key=key)
                filename = key.removeprefix(prefix)
                files[filename] = resp['Body'].read().decode('utf-8', errors='replace')
            except ClientError:
                pass
    return files


def _read_meta(instance_prefix: str) -> dict:
    """Read meta.txt key:value pairs from an instance's S3 output."""
    meta = {}
    try:
        resp = s3.get_object(Bucket=RESULTS_BUCKET, Key=f'{instance_prefix}/meta.txt')
        for line in resp['Body'].read().decode('utf-8').splitlines():
            if ':' in line:
                key, _, val = line.partition(':')
                meta[key.strip()] = val.strip()
    except ClientError:
        pass
    return meta


def _token_metrics(meta: dict) -> dict:
    """Extract token usage fields from parsed meta.txt."""
    return {
        'input_tokens': int(meta.get('input_tokens', 0)),
        'output_tokens': int(meta.get('output_tokens', 0)),
        'cost_usd': float(meta.get('cost_usd', 0.0)),
    }


def _check_patterns(files: dict) -> dict:
    """Run automated compliance checks against generated project files."""
    all_code = '\n'.join(files.values())
    docker_content = files.get('Dockerfile', '')
    return {
        'file_count': len(files),
        'total_lines': sum(len(v.splitlines()) for v in files.values()),
        'has_docstrings': bool(re.search(r'"""[\s\S]+?"""', all_code)),
        'uses_parameterized_queries': bool(re.search(r'\.execute\s*\([^)]*\?', all_code)),
        'has_string_format_sql': bool(re.search(r'\.execute\s*\(\s*f["\']|\.format\s*\(', all_code)),
        'hardcoded_secrets': bool(re.search(
            r'(password|secret|api_key|token)\s*=\s*["\'][^"\']{4,}["\']',
            all_code, re.IGNORECASE,
        )),
        'docker_non_root': bool(re.search(r'^USER\s+(?!root\b)\S+', docker_content, re.MULTILINE)),
        'docker_pinned_base': bool(re.search(r'^FROM\s+\S+:\S+-\S+', docker_content, re.MULTILINE)),
        'flask_debug_true': bool(re.search(r'debug\s*=\s*True', all_code, re.IGNORECASE)),
        'has_type_hints': bool(re.search(r'def \w+\(.*:.*\)\s*->', all_code)),
        'has_input_validation': bool(re.search(r'(abort|raise|400|422|jsonify.*error)', all_code, re.IGNORECASE)),
    }


def _call_bedrock(files1: dict, files2: dict, metrics1: dict, metrics2: dict) -> str:
    """Generate narrative analysis via Bedrock."""
    def summarize_files(files):
        lines = []
        for name, content in list(files.items())[:4]:
            lines.append(f"### {name}\n```\n{content[:1500]}\n```")
        return '\n'.join(lines)

    prompt = f"""You are analyzing outputs from two AI coding sessions building a Task Manager REST API:
- Instance 1 (Control): Claude Code with NO enforcement
- Instance 2 (Enforced): Claude Code WITH Agent Enforcer active (enforced coding standards and security rules)

## Instance 1 Metrics
{json.dumps(metrics1, indent=2)}

## Instance 1 Key Files
{summarize_files(files1)}

## Instance 2 Metrics
{json.dumps(metrics2, indent=2)}

## Instance 2 Key Files
{summarize_files(files2)}

Write a detailed results.md section (markdown) covering:
1. **Coding Standard Compliance** — docstrings, type hints, code structure differences
2. **Security Compliance** — SQL injection risk, secrets handling, container security
3. **Token Efficiency** — Instance 1 used {metrics1['input_tokens']:,} input / {metrics1['output_tokens']:,} output tokens (${metrics1['cost_usd']:.4f}). Instance 2 used {metrics2['input_tokens']:,} input / {metrics2['output_tokens']:,} output tokens (${metrics2['cost_usd']:.4f}). Explain what the difference means in terms of iteration count, planning overhead, and cost at scale (e.g. if running 1,000 agents/day).
4. **Summary Table** — winner per category
5. **Overall Assessment** — 2-3 sentence verdict

Be specific with code examples where relevant."""

    resp = bedrock.invoke_model(
        modelId=BEDROCK_MODEL_ID,
        body=json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 4096,
            "messages": [{"role": "user", "content": prompt}],
        }),
        contentType='application/json',
        accept='application/json',
    )
    return json.loads(resp['body'].read())['content'][0]['text']


def _build_results_md(metrics1: dict, metrics2: dict, analysis: str) -> str:
    """Assemble the final results.md document."""
    def yn(val):
        return '✅ Yes' if val else '❌ No'

    def fmt_tokens(n):
        return f"{n:,}" if n else "—"

    def fmt_cost(c):
        return f"${c:.4f}" if c else "—"

    return f"""# Agent Enforcer Demo Results

> Generated automatically after both demo instances completed.

## Automated Compliance Metrics

| Metric | Control (No Enforcer) | Enforced (Agent Enforcer) |
|--------|----------------------|--------------------------|
| Input tokens | {fmt_tokens(metrics1['input_tokens'])} | {fmt_tokens(metrics2['input_tokens'])} |
| Output tokens | {fmt_tokens(metrics1['output_tokens'])} | {fmt_tokens(metrics2['output_tokens'])} |
| Total cost | {fmt_cost(metrics1['cost_usd'])} | {fmt_cost(metrics2['cost_usd'])} |
| Files created | {metrics1['file_count']} | {metrics2['file_count']} |
| Total lines of code | {metrics1['total_lines']} | {metrics2['total_lines']} |
| Has docstrings | {yn(metrics1['has_docstrings'])} | {yn(metrics2['has_docstrings'])} |
| Parameterized SQL queries | {yn(metrics1['uses_parameterized_queries'])} | {yn(metrics2['uses_parameterized_queries'])} |
| SQL injection risk (f-string SQL) | {yn(metrics1['has_string_format_sql'])} | {yn(metrics2['has_string_format_sql'])} |
| Hardcoded secrets | {yn(metrics1['hardcoded_secrets'])} | {yn(metrics2['hardcoded_secrets'])} |
| Docker non-root user | {yn(metrics1['docker_non_root'])} | {yn(metrics2['docker_non_root'])} |
| Docker pinned base image | {yn(metrics1['docker_pinned_base'])} | {yn(metrics2['docker_pinned_base'])} |
| Flask debug=True in Dockerfile | {yn(metrics1['flask_debug_true'])} | {yn(metrics2['flask_debug_true'])} |
| Type hints | {yn(metrics1['has_type_hints'])} | {yn(metrics2['has_type_hints'])} |
| Input validation | {yn(metrics1['has_input_validation'])} | {yn(metrics2['has_input_validation'])} |

---

{analysis}
"""
