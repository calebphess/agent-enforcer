"""
Contact Lambda unit tests.

All AWS calls are mocked with moto — no real AWS credentials needed.
Run: pytest tests/lambda/test_contact.py -v

Loaded via importlib.util.spec_from_file_location under a unique module name:
test_license.py does a bare `import index`, and a second lambda's index.py
would collide with it in sys.modules.
"""
import importlib.util
import json
import os

import boto3
import pytest
from moto import mock_aws

CONTACT_INDEX = os.path.join(os.path.dirname(__file__), '../../cdk/lib/lambda/contact/index.py')


@pytest.fixture()
def aws_resources(monkeypatch):
    """Spin up a mocked SNS topic for each test."""
    monkeypatch.setenv('AWS_DEFAULT_REGION', 'us-east-1')
    monkeypatch.setenv('AWS_ACCESS_KEY_ID', 'testing')
    monkeypatch.setenv('AWS_SECRET_ACCESS_KEY', 'testing')
    monkeypatch.setenv('AWS_SECURITY_TOKEN', 'testing')
    monkeypatch.setenv('AWS_SESSION_TOKEN', 'testing')

    with mock_aws():
        sns = boto3.client('sns', region_name='us-east-1')
        topic = sns.create_topic(Name='agent-enforcer-contact-requests-test')
        monkeypatch.setenv('CONTACT_TOPIC_ARN', topic['TopicArn'])

        spec = importlib.util.spec_from_file_location('contact_index', CONTACT_INDEX)
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        m.sns_client = sns

        yield {'module': m, 'sns': sns, 'topic_arn': topic['TopicArn']}


def _event(body=None):
    return {'routeKey': 'POST /contact', 'body': json.dumps(body) if body is not None else None}


VALID_PAYLOAD = {
    'name': 'Jane Doe',
    'email': 'jane@example.com',
    'organization': 'Acme Corp',
    'tier': 'Enterprise',
    'seats': '500',
    'message': 'Tell us about your AI tooling.',
}


def test_valid_submission_publishes_and_returns_ok(aws_resources):
    m = aws_resources['module']
    resp = m.handler(_event(VALID_PAYLOAD), None)

    assert resp['statusCode'] == 200
    body = json.loads(resp['body'])
    assert body == {'ok': True, 'message': 'Briefing request received.'}


def test_valid_submission_publishes_expected_message(aws_resources):
    m = aws_resources['module']
    published = []
    original_publish = aws_resources['sns'].publish

    def spy_publish(**kwargs):
        published.append(kwargs)
        return original_publish(**kwargs)

    m.sns_client.publish = spy_publish
    m.handler(_event(VALID_PAYLOAD), None)

    assert len(published) == 1
    assert published[0]['TopicArn'] == aws_resources['topic_arn']
    assert 'Acme Corp' in published[0]['Subject']
    assert 'jane@example.com' in published[0]['Message']
    assert 'Enterprise' in published[0]['Message']


def test_missing_required_fields_returns_422_with_field_errors(aws_resources):
    m = aws_resources['module']
    resp = m.handler(_event({'seats': '10'}), None)

    assert resp['statusCode'] == 422
    body = json.loads(resp['body'])
    assert body['fields']['name'] == 'Name is required.'
    assert body['fields']['email'] == 'Work email is required.'
    assert body['fields']['organization'] == 'Organization is required.'


def test_invalid_email_returns_422(aws_resources):
    m = aws_resources['module']
    resp = m.handler(_event({**VALID_PAYLOAD, 'email': 'not-an-email'}), None)

    assert resp['statusCode'] == 422
    body = json.loads(resp['body'])
    assert body['fields']['email'] == 'Enter a valid email address.'


def test_invalid_tier_returns_422(aws_resources):
    m = aws_resources['module']
    resp = m.handler(_event({**VALID_PAYLOAD, 'tier': 'Unlimited Plus Ultra'}), None)

    assert resp['statusCode'] == 422
    body = json.loads(resp['body'])
    assert body['fields']['tier'] == 'Invalid tier selection.'


def test_missing_tier_defaults_to_not_sure_yet(aws_resources):
    m = aws_resources['module']
    payload = {**VALID_PAYLOAD}
    del payload['tier']

    published = []
    m.sns_client.publish = lambda **kwargs: published.append(kwargs) or {'MessageId': 'x'}
    resp = m.handler(_event(payload), None)

    assert resp['statusCode'] == 200
    assert 'Not sure yet' in published[0]['Message']


def test_invalid_json_body_returns_400(aws_resources):
    m = aws_resources['module']
    resp = m.handler({'routeKey': 'POST /contact', 'body': '{not json'}, None)
    assert resp['statusCode'] == 400


def test_unknown_route_returns_404(aws_resources):
    m = aws_resources['module']
    resp = m.handler({'routeKey': 'GET /nope', 'body': None}, None)
    assert resp['statusCode'] == 404
