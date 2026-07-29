import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import { Construct } from 'constructs';

const API_KEY_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:008971674866:secret:agent-enforcer/dev/api-key-RNsIUc';
const RPM_BUCKET = 'agent-enforcer-rpm';
// User-populated via cdk/scripts/push-local-secrets.sh — cursor-agent only
// accepts a Cursor User API key (Anthropic keys don't work)
const CURSOR_KEY_SECRET_NAME = 'agent-enforcer/dev/cursor-api-key';

export interface DemoStackProps extends cdk.StackProps {
  // API Gateway base URL from AgentEnforcerStack — agents register and sync through this
  apiEndpoint: string;
}

export class DemoStack extends cdk.Stack {
  public readonly demoResultsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: DemoStackProps) {
    super(scope, id, props);

    const { apiEndpoint } = props;

    // Results bucket lives in DemoStack to avoid cross-stack S3 notification cycles
    const demoResultsBucket = new s3.Bucket(this, 'DemoResults', {
      bucketName: `agent-enforcer-results-${this.account}`,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: false,
        blockPublicPolicy: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false,
      }),
      publicReadAccess: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    this.demoResultsBucket = demoResultsBucket;

    // Upload demo docs to results bucket so instances can download them
    new s3deploy.BucketDeployment(this, 'DemoAssets', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../demo'))],
      destinationBucket: demoResultsBucket,
      destinationKeyPrefix: 'demo-assets/',
      prune: false,
    });

    // Self-destruct Lambda — instances call this when done
    const selfDestructFn = new lambda.Function(this, 'SelfDestruct', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambda/self-destruct')),
      timeout: cdk.Duration.seconds(30),
      environment: { AWS_ACCOUNT_REGION: this.region },
    });
    selfDestructFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ec2:TerminateInstances', 'ec2:DescribeInstances'],
      resources: ['*'],
    }));
    const selfDestructUrl = selfDestructFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: { allowedOrigins: ['*'], allowedMethods: [lambda.HttpMethod.POST] },
    });

    // Analysis Lambda — triggered when either instance uploads its 'completed' marker
    const analysisFn = new lambda.Function(this, 'Analysis', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambda/analysis')),
      timeout: cdk.Duration.minutes(10),
      memorySize: 512,
      environment: {
        RESULTS_BUCKET: demoResultsBucket.bucketName,
        BEDROCK_MODEL_ID: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
        AWS_ACCOUNT_REGION: this.region,
      },
    });
    demoResultsBucket.grantReadWrite(analysisFn);
    // Cross-region inference profiles route across multiple AWS regions
    analysisFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: ['*'],
    }));
    demoResultsBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED_PUT,
      new s3n.LambdaDestination(analysisFn),
      { suffix: 'completed' },
    );

    // Shared IAM role for both demo instances
    const instanceRole = new iam.Role(this, 'DemoInstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    });
    demoResultsBucket.grantWrite(instanceRole);
    demoResultsBucket.grantRead(instanceRole);
    // Note: no direct dist bucket grant — enforced instance accesses configs via the license API
    // which generates presigned URLs (presigned URLs carry their own embedded auth credentials)
    instanceRole.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [
        API_KEY_SECRET_ARN,
        // Name-based wildcard: the secret is created outside CDK (push-local-secrets.sh)
        `arn:aws:secretsmanager:${this.region}:${this.account}:secret:${CURSOR_KEY_SECRET_NAME}-*`,
      ],
    }));
    instanceRole.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject', 's3:ListBucket'],
      resources: [`arn:aws:s3:::${RPM_BUCKET}`, `arn:aws:s3:::${RPM_BUCKET}/*`],
    }));

    const vpc = ec2.Vpc.fromLookup(this, 'DefaultVpc', { isDefault: true });

    const sg = new ec2.SecurityGroup(this, 'DemoSg', {
      vpc,
      description: 'Agent Enforcer demo instances - outbound only',
      allowAllOutbound: true,
    });

    const ami = ec2.MachineImage.lookup({
      name: 'Rocky-9-EC2-Base-9.*x86_64*',
      owners: ['679593333241'],
      filters: {
        architecture: ['x86_64'],
        'virtualization-type': ['hvm'],
        'root-device-type': ['ebs'],
      },
    });

    const buildTimestamp = this.node.tryGetContext('buildTimestamp') as string | undefined ?? 'initial';

    // 'auto' (default): instances run the canned spec, upload, self-destruct.
    // 'interactive': instances stay up with the demo-prompt wrapper installed
    // for live customer demos (see README "Interactive customer demo").
    // Flipping the mode replaces both instances (userDataCausesReplacement).
    const demoMode = (this.node.tryGetContext('demoMode') as string | undefined) ?? 'auto';

    const baseSetup = [
      '#!/bin/bash',
      `# Build ID: ${buildTimestamp}`,
      'set -euxo pipefail',
      'exec > >(tee /var/log/demo-setup.log) 2>&1',
      'echo "=== Demo instance starting at $(date) ==="',
      '',
      '# 2GB swap — t2.micro has 1GB RAM; coding agents need the headroom',
      'fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile',
      "echo '/swapfile none swap sw 0 0' >> /etc/fstab",
      '',
      '# System deps + SSM agent (Rocky Linux does not include it)',
      'dnf install -y curl unzip tar python3 git',
      'dnf install -y https://s3.amazonaws.com/ec2-downloads-windows/SSMAgent/latest/linux_amd64/amazon-ssm-agent.rpm || true',
      'systemctl enable amazon-ssm-agent && systemctl start amazon-ssm-agent',
      '',
      '# AWS CLI v2',
      'curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip',
      'unzip -q /tmp/awscliv2.zip -d /tmp',
      '/tmp/aws/install',
      '',
      '# Node.js 22',
      'curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -',
      'dnf install -y nodejs',
      '',
      '# Claude Code',
      'npm install -g @anthropic-ai/claude-code',
      '',
      '# IMDSv2 instance ID',
      'TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")',
      'INSTANCE_ID=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-id)',
      '',
      '# API key from Secrets Manager',
      `ANTHROPIC_API_KEY=$(aws secretsmanager get-secret-value --secret-id "${API_KEY_SECRET_ARN}" --query 'SecretString' --output text | python3 -c "import sys,json; print(json.load(sys.stdin)['api-key'])")`,
      'export ANTHROPIC_API_KEY',
      '',
      '# Demo workspace — owned by demo user (claude refuses to run as root)',
      'useradd -m demo',
      'mkdir -p /demo/project /demo/output',
      'chown -R demo:demo /demo',
      '',
      '# Download system spec from S3',
      `aws s3 cp "s3://${demoResultsBucket.bucketName}/demo-assets/system-spec.md" /demo/system-spec.md`,
      'chmod 644 /demo/system-spec.md',
    ].join('\n');

    const buildAndUpload = (instanceNum: number) => [
      '',
      '# Run Claude Code as demo user — JSON output captures token usage',
      '# Retry up to 3 times on transient 500 errors',
      'for attempt in 1 2 3; do',
      `  su -s /bin/bash demo -c "export ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY; cd /demo/project; claude -p \\"\\$(cat /demo/system-spec.md)\\" --output-format json --dangerously-skip-permissions" > /demo/output/session.json 2>/demo/output/session.log && break`,
      '  echo "Attempt $attempt failed, retrying in 30s..."',
      '  sleep 30',
      'done || true',
      '',
      '# Parse token usage from Claude Code JSON output',
      "INPUT_TOKENS=$(python3 -c \"import json; d=json.load(open('/demo/output/session.json')); u=d.get('usage',{}); print(u.get('input_tokens',0)+u.get('cache_read_input_tokens',0)+u.get('cache_creation_input_tokens',0))\" 2>/dev/null || echo 0)",
      "OUTPUT_TOKENS=$(python3 -c \"import json; d=json.load(open('/demo/output/session.json')); print(d.get('usage',{}).get('output_tokens',0))\" 2>/dev/null || echo 0)",
      "COST_USD=$(python3 -c \"import json; d=json.load(open('/demo/output/session.json')); print(d.get('total_cost_usd', d.get('cost_usd', 0)))\" 2>/dev/null || echo 0)",
      '',
      '# Capture summary stats',
      `echo "instance: ${instanceNum}" > /demo/output/meta.txt`,
      'echo "completed_at: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> /demo/output/meta.txt',
      'echo "files_created: $(find /demo/project -type f | wc -l)" >> /demo/output/meta.txt',
      'echo "total_lines: $(find /demo/project -type f -name \'*.py\' -exec wc -l {} + 2>/dev/null | tail -1)" >> /demo/output/meta.txt',
      'echo "input_tokens: $INPUT_TOKENS" >> /demo/output/meta.txt',
      'echo "output_tokens: $OUTPUT_TOKENS" >> /demo/output/meta.txt',
      'echo "cost_usd: $COST_USD" >> /demo/output/meta.txt',
      '',
      '# Upload results to S3',
      `aws s3 sync /demo/project/ "s3://${demoResultsBucket.bucketName}/instance${instanceNum}/project/" --quiet`,
      `aws s3 cp /demo/output/session.json "s3://${demoResultsBucket.bucketName}/instance${instanceNum}/session.json"`,
      `aws s3 cp /demo/output/session.log "s3://${demoResultsBucket.bucketName}/instance${instanceNum}/session.log"`,
      `aws s3 cp /demo/output/meta.txt "s3://${demoResultsBucket.bucketName}/instance${instanceNum}/meta.txt"`,
      '',
      '# Signal completion (triggers analysis Lambda)',
      `echo "$(date -u +%Y-%m-%dT%H:%M:%SZ)" | aws s3 cp - "s3://${demoResultsBucket.bucketName}/instance${instanceNum}/completed"`,
      '',
      '# Self-destruct',
      `curl -s -X POST "${selfDestructUrl.url}" -H 'Content-Type: application/json' -d "{\\"instance_id\\": \\"$INSTANCE_ID\\"}" || true`,
    ].join('\n');

    // Interactive mode tail: no auto-run, no self-destruct — the operator runs
    // `sudo demo-prompt "<prompt>"` on both boxes via Session Manager instead.
    // `assistant` marks which coding agent this box demos (claude | cursor).
    const interactiveTail = (role: 'instance1' | 'instance2', assistant: 'claude' | 'cursor') => [
      '',
      '# === INTERACTIVE DEMO MODE — no auto-run, no self-destruct ===',
      `echo "${role}" > /etc/demo-role`,
      `echo "${assistant}" > /etc/demo-assistant`,
      '# ARNs only — no secret material on disk; demo-prompt fetches keys at run time',
      'cat > /etc/demo-env <<EOF',
      `RESULTS_BUCKET=${demoResultsBucket.bucketName}`,
      `API_KEY_SECRET_ARN=${API_KEY_SECRET_ARN}`,
      `CURSOR_KEY_SECRET_NAME=${CURSOR_KEY_SECRET_NAME}`,
      'EOF',
      'chmod 644 /etc/demo-env',
      `aws s3 cp "s3://${demoResultsBucket.bucketName}/demo-assets/demo-prompt.sh" /usr/local/bin/demo-prompt`,
      `aws s3 cp "s3://${demoResultsBucket.bucketName}/demo-assets/demo-stream-filter.py" /usr/local/bin/demo-stream-filter.py`,
      'chmod 755 /usr/local/bin/demo-prompt /usr/local/bin/demo-stream-filter.py',
      '# Defensive: guarantee the Session Manager user can sudo on Rocky 9',
      "echo 'ssm-user ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/91-demo-ssm-user",
      'chmod 440 /etc/sudoers.d/91-demo-ssm-user',
      `echo 'Agent Enforcer demo (${role}, ${assistant}). Run:  sudo demo-prompt "build me a ..."' > /etc/motd`,
      'echo "=== Interactive demo setup complete at $(date) ==="',
    ].join('\n');

    // Agent Enforcer install + registration — RPM from the stable installer
    // key (fallback: newest .rpm anywhere in the bucket), register with the
    // instance ID as user_id, then sync twice: the first pulls bundles, the
    // second reports the applied versions back to the fleet console.
    const enforcedSetup = [
      `# build: ${buildTimestamp}`,
      '',
      '# === AGENT ENFORCER SETUP ===',
      '',
      `aws s3 cp "s3://${RPM_BUCKET}/installers/latest/agent-enforcer.rpm" /tmp/agent-enforcer.rpm || {`,
      `  RPM_FILE=$(aws s3 ls "s3://${RPM_BUCKET}/" --recursive | grep "\\.rpm$" | sort | tail -1 | awk '{print $4}')`,
      `  aws s3 cp "s3://${RPM_BUCKET}/$RPM_FILE" /tmp/agent-enforcer.rpm`,
      '}',
      'rpm -i /tmp/agent-enforcer.rpm',
      '',
      '# Register with the license API using instance ID as user_id',
      '# apiEndpoint is injected by CDK at synthesis time (resolves at CloudFormation deploy)',
      `AGENT_ENFORCER_API="${apiEndpoint}agent-enforcer"`,
      'sudo agent-enforcer register --no-prompt \\',
      '  --user-id "$INSTANCE_ID" \\',
      '  --endpoint "$AGENT_ENFORCER_API"',
      '',
      '# Sync twice: pull bundles, then report applied versions to the fleet',
      'sleep 5',
      'agent-enforcer sync || true',
      'agent-enforcer sync || true',
    ].join('\n');

    // Cursor CLI for the cursor demo box — installed as the demo user (the
    // installer drops it in ~/.local/bin), then linked system-wide
    const cursorSetup = [
      '',
      '# === CURSOR CLI SETUP ===',
      "su -s /bin/bash demo -c 'curl https://cursor.com/install -fsS | bash' || true",
      'ln -sf /home/demo/.local/bin/cursor-agent /usr/local/bin/cursor-agent 2>/dev/null || true',
      'cursor-agent --version || echo "WARNING: cursor-agent install failed"',
    ].join('\n');

    // Instance 1 — claude-code box. Auto mode: unenforced control for the
    // side-by-side comparison. Interactive mode: registered + enforced, so the
    // fleet console shows a real claude-code agent.
    const ud1 = ec2.UserData.forLinux();
    ud1.addCommands(
      demoMode === 'interactive'
        ? baseSetup + '\n' + enforcedSetup + '\n' + interactiveTail('instance1', 'claude')
        : baseSetup + '\n' + buildAndUpload(1),
    );

    const demoInstanceType = ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO);

    const controlInstance = new ec2.Instance(this, 'ControlInstance', {
      vpc,
      instanceType: demoInstanceType,
      machineImage: ami,
      securityGroup: sg,
      role: instanceRole,
      userData: ud1,
      userDataCausesReplacement: true,
      blockDevices: [{
        deviceName: '/dev/sda1',
        volume: ec2.BlockDeviceVolume.ebs(20),
      }],
    });
    cdk.Tags.of(controlInstance).add('Project', 'agent-enforcer-demo');
    cdk.Tags.of(controlInstance).add('Name', 'agent-enforcer-demo-claude');
    controlInstance.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    // Instance 2 — enforced in both modes. Auto mode: claude-code under
    // enforcement for the comparison run. Interactive mode: the cursor box.
    const ud2 = ec2.UserData.forLinux();
    ud2.addCommands(
      demoMode === 'interactive'
        ? baseSetup + '\n' + cursorSetup + '\n' + enforcedSetup + '\n' + interactiveTail('instance2', 'cursor')
        : baseSetup + '\n' + enforcedSetup + '\n' + buildAndUpload(2),
    );

    const enforcedInstance = new ec2.Instance(this, 'EnforcedInstance', {
      vpc,
      instanceType: demoInstanceType,
      machineImage: ami,
      securityGroup: sg,
      role: instanceRole,
      userData: ud2,
      userDataCausesReplacement: true,
      blockDevices: [{
        deviceName: '/dev/sda1',
        volume: ec2.BlockDeviceVolume.ebs(20),
      }],
    });
    cdk.Tags.of(enforcedInstance).add('Project', 'agent-enforcer-demo');
    cdk.Tags.of(enforcedInstance).add('Name', 'agent-enforcer-demo-cursor');
    enforcedInstance.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    new cdk.CfnOutput(this, 'SelfDestructFunctionUrl', { value: selfDestructUrl.url });
    new cdk.CfnOutput(this, 'ResultsBucketUrl', {
      value: `https://${demoResultsBucket.bucketName}.s3.amazonaws.com/results.md`,
    });
    new cdk.CfnOutput(this, 'DemoMode', { value: demoMode });
    new cdk.CfnOutput(this, 'ControlInstanceId', { value: controlInstance.instanceId });
    new cdk.CfnOutput(this, 'EnforcedInstanceId', { value: enforcedInstance.instanceId });
    // Open these two side by side for the interactive customer demo
    new cdk.CfnOutput(this, 'ControlSessionUrl', {
      value: `https://${this.region}.console.aws.amazon.com/systems-manager/session-manager/${controlInstance.instanceId}?region=${this.region}`,
    });
    new cdk.CfnOutput(this, 'EnforcedSessionUrl', {
      value: `https://${this.region}.console.aws.amazon.com/systems-manager/session-manager/${enforcedInstance.instanceId}?region=${this.region}`,
    });
    new cdk.CfnOutput(this, 'ResultsBucketBaseUrl', {
      value: `https://${demoResultsBucket.bucketName}.s3.amazonaws.com/`,
    });
  }
}
