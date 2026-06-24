"""
Self-Destruct Lambda

Demo EC2 instances call this Function URL with their instance ID after
uploading results to S3. Validates the instance has the demo project tag
before terminating it.
"""
import json
import os

import boto3

ec2 = boto3.client('ec2', region_name=os.environ.get('AWS_REGION', 'us-east-1'))

REQUIRED_TAG_KEY = 'Project'
REQUIRED_TAG_VALUE = 'agent-enforcer-demo'


def handler(event, context):
    """Terminate a tagged demo EC2 instance."""
    try:
        body = json.loads(event.get('body') or '{}')
    except json.JSONDecodeError:
        return _resp(400, 'Invalid JSON body')

    instance_id = body.get('instance_id', '').strip()
    if not instance_id or not instance_id.startswith('i-'):
        return _resp(400, 'Missing or invalid instance_id')

    try:
        resp = ec2.describe_instances(InstanceIds=[instance_id])
        reservations = resp.get('Reservations', [])
        if not reservations:
            return _resp(404, f'Instance {instance_id} not found')

        instance = reservations[0]['Instances'][0]
        tags = {t['Key']: t['Value'] for t in instance.get('Tags', [])}

        if tags.get(REQUIRED_TAG_KEY) != REQUIRED_TAG_VALUE:
            print(f"Rejected termination of {instance_id} — missing required tag {REQUIRED_TAG_KEY}={REQUIRED_TAG_VALUE}")
            return _resp(403, 'Instance is not a demo instance')

        ec2.terminate_instances(InstanceIds=[instance_id])
        print(f"Terminated demo instance: {instance_id}")
        return _resp(200, f'Terminated {instance_id}')

    except ec2.exceptions.ClientError as e:
        print(f"Error terminating {instance_id}: {e}")
        return _resp(500, str(e))


def _resp(status: int, message: str) -> dict:
    """Build a Lambda Function URL response."""
    return {
        'statusCode': status,
        'headers': {'Content-Type': 'application/json'},
        'body': json.dumps({'message': message}),
    }
