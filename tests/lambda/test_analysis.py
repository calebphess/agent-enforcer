"""
Analysis Lambda unit tests — per-base-prefix results generation for the
auto-run demo (root layout) and interactive demo runs (runs/<id>/ layout).

Bedrock is stubbed at the module level; S3 is mocked with moto.
Run: pytest tests/lambda/test_analysis.py -v

Loaded via importlib.util.spec_from_file_location under a unique module name
(index.py collision hazard, see test_admin_api.py). RESULTS_BUCKET and
BEDROCK_MODEL_ID are read at import time — env must be set before exec.
"""
import importlib.util
import os

import boto3
import pytest
from moto import mock_aws

ANALYSIS_INDEX = os.path.join(
    os.path.dirname(__file__), '../../cdk/lib/lambda/analysis/index.py'
)

RESULTS_BUCKET = 'agent-enforcer-results-test'


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
    monkeypatch.setenv('RESULTS_BUCKET', RESULTS_BUCKET)
    monkeypatch.setenv('BEDROCK_MODEL_ID', 'test-model')

    with mock_aws():
        s3 = boto3.client('s3', region_name='us-east-1')
        s3.create_bucket(Bucket=RESULTS_BUCKET)

        spec = importlib.util.spec_from_file_location('analysis_index', ANALYSIS_INDEX)
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        m.s3 = s3

        bedrock_calls = []

        def fake_call_bedrock(*args, **kwargs):
            bedrock_calls.append(args)
            return 'STUB NARRATIVE'

        m._call_bedrock = fake_call_bedrock

        yield {'module': m, 's3': s3, 'bedrock_calls': bedrock_calls}


def _s3_event(key):
    return {'Records': [{
        's3': {'bucket': {'name': RESULTS_BUCKET}, 'object': {'key': key}},
    }]}


def _seed_instance(s3, base, instance, prompt=None):
    """Upload the marker + a minimal project + meta.txt for one instance."""
    prefix = f'{base}{instance}'
    s3.put_object(Bucket=RESULTS_BUCKET, Key=f'{prefix}/completed', Body=b'2026-07-20T00:00:00Z')
    s3.put_object(Bucket=RESULTS_BUCKET, Key=f'{prefix}/project/app.py',
                  Body=b'def main() -> None:\n    """Entry point."""\n')
    meta = 'instance: 1\ninput_tokens: 10\noutput_tokens: 20\ncost_usd: 0.01\n'
    if prompt:
        meta += f'prompt: {prompt}\n'
    s3.put_object(Bucket=RESULTS_BUCKET, Key=f'{prefix}/meta.txt', Body=meta.encode())


def _key_exists(s3, key):
    from botocore.exceptions import ClientError
    try:
        s3.head_object(Bucket=RESULTS_BUCKET, Key=key)
        return True
    except ClientError:
        return False


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_analysis_waits_for_both_instances(aws_resources):
    m = aws_resources['module']
    s3 = aws_resources['s3']
    _seed_instance(s3, 'runs/abc123def456/', 'instance1')

    m.handler(_s3_event('runs/abc123def456/instance1/completed'), None)

    assert not _key_exists(s3, 'runs/abc123def456/results.md')
    assert aws_resources['bedrock_calls'] == []


def test_analysis_writes_results_for_run_prefix(aws_resources):
    m = aws_resources['module']
    s3 = aws_resources['s3']
    _seed_instance(s3, 'runs/abc123def456/', 'instance1', prompt='Build a log analyzer')
    _seed_instance(s3, 'runs/abc123def456/', 'instance2', prompt='Build a log analyzer')

    m.handler(_s3_event('runs/abc123def456/instance2/completed'), None)

    body = s3.get_object(Bucket=RESULTS_BUCKET, Key='runs/abc123def456/results.md')['Body'].read().decode()
    assert 'STUB NARRATIVE' in body
    assert 'Automated Compliance Metrics' in body
    assert not _key_exists(s3, 'results.md')  # nothing leaks to the root layout
    # The operator's prompt reaches the Bedrock narrative as the task
    assert aws_resources['bedrock_calls'][0][4] == 'Build a log analyzer'


def test_analysis_handles_root_level_auto_layout(aws_resources):
    """Regression guard: base='' reproduces the original auto-demo behavior."""
    m = aws_resources['module']
    s3 = aws_resources['s3']
    _seed_instance(s3, '', 'instance1')
    _seed_instance(s3, '', 'instance2')

    m.handler(_s3_event('instance2/completed'), None)

    body = s3.get_object(Bucket=RESULTS_BUCKET, Key='results.md')['Body'].read().decode()
    assert 'STUB NARRATIVE' in body


def test_analysis_skips_when_results_already_exist(aws_resources):
    m = aws_resources['module']
    s3 = aws_resources['s3']
    _seed_instance(s3, 'runs/abc123def456/', 'instance1')
    _seed_instance(s3, 'runs/abc123def456/', 'instance2')
    s3.put_object(Bucket=RESULTS_BUCKET, Key='runs/abc123def456/results.md', Body=b'SENTINEL')

    m.handler(_s3_event('runs/abc123def456/instance2/completed'), None)

    body = s3.get_object(Bucket=RESULTS_BUCKET, Key='runs/abc123def456/results.md')['Body'].read()
    assert body == b'SENTINEL'
    assert aws_resources['bedrock_calls'] == []
