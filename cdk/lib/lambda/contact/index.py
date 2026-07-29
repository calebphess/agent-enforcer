"""
Contact Lambda — Agent Enforcer showcase site

Handles the single route dispatched by API Gateway HTTP API:

  POST /contact
    - Validates a briefing-request submission from ui/product-page's contact
      form (ported from the zip's original app/api/contact/route.ts, which
      can't ship as a Next.js Route Handler in a static export)
    - Publishes the submission to an SNS topic, which emails
      contact@alchemistfederal.com

Environment variables are read at handler call time (not import time) so that
tests can inject mocked values without import-order issues.
"""
import json
import os
import re
from typing import Any

import boto3

sns_client = boto3.client('sns')

TIERS = ('Division', 'Organization', 'Enterprise', 'Unlimited', 'Not sure yet')
EMAIL_RE = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')


def handler(event: dict, context: Any) -> dict:
    route = event.get('routeKey', '')
    try:
        body = json.loads(event.get('body') or '{}')
    except json.JSONDecodeError:
        return _resp(400, {'error': 'Invalid JSON body.'})

    if route == 'POST /contact':
        return _submit(body)

    return _resp(404, {'error': f'Unknown route: {route}'})


def _submit(body: dict) -> dict:
    name = (body.get('name') or '').strip()
    email = (body.get('email') or '').strip()
    organization = (body.get('organization') or '').strip()
    tier = (body.get('tier') or '').strip()
    seats = (body.get('seats') or '').strip()
    message = (body.get('message') or '').strip()

    errors: dict[str, str] = {}
    if not name:
        errors['name'] = 'Name is required.'
    if not email:
        errors['email'] = 'Work email is required.'
    elif not EMAIL_RE.match(email):
        errors['email'] = 'Enter a valid email address.'
    if not organization:
        errors['organization'] = 'Organization is required.'
    if tier and tier not in TIERS:
        errors['tier'] = 'Invalid tier selection.'

    if errors:
        return _resp(422, {'error': 'Validation failed.', 'fields': errors})

    submission = {
        'name': name,
        'email': email,
        'organization': organization,
        'tier': tier or 'Not sure yet',
        'seats': seats,
        'message': message,
    }

    topic_arn = os.environ['CONTACT_TOPIC_ARN']
    sns_client.publish(
        TopicArn=topic_arn,
        Subject=f'Agent Enforcer briefing request — {organization}'[:100],
        Message=_format_message(submission),
    )

    print(f"Contact submission published for {organization} <{email}>")
    return _resp(200, {'ok': True, 'message': 'Briefing request received.'})


def _format_message(s: dict) -> str:
    return (
        'New Agent Enforcer briefing request\n\n'
        f'Name:         {s["name"]}\n'
        f'Email:        {s["email"]}\n'
        f'Organization: {s["organization"]}\n'
        f'Tier:         {s["tier"]}\n'
        f'Approx seats: {s["seats"] or "(not provided)"}\n\n'
        f'What they\'re trying to govern:\n{s["message"] or "(not provided)"}\n'
    )


def _resp(status: int, body: dict) -> dict:
    return {
        'statusCode': status,
        'headers': {'Content-Type': 'application/json'},
        'body': json.dumps(body, separators=(',', ':')),
    }
