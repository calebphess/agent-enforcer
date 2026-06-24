import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

const RPM_BUCKET = 'agent-enforcer-rpm';

/**
 * RpmBuilderStack
 *
 * Spins up an EC2 instance that builds the agent-enforcer RPM and uploads it to S3,
 * then self-destructs. Deploy this stack whenever you want a fresh RPM build.
 *
 * Usage:
 *   npx cdk deploy RpmBuilderStack                                     # default Rocky Linux 9
 *   npx cdk deploy RpmBuilderStack --context builderAmi=ami-xxxxxxxx   # custom AMI
 *   npx cdk deploy RpmBuilderStack --context buildTimestamp=$(date +%s) # force new build if unchanged
 *
 * The instance self-terminates after uploading the RPM. To trigger another build, redeploy
 * with a new --context buildTimestamp so CDK replaces the (already-terminated) instance.
 *
 * Built RPM lands at: s3://agent-enforcer-rpm/<package>.rpm
 * Build log at:       s3://agent-enforcer-rpm/build-logs/
 */
export class RpmBuilderStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Import pre-existing RPM bucket (not managed by this stack)
    const rpmBucket = s3.Bucket.fromBucketName(this, 'RpmBucket', RPM_BUCKET);

    // Sync the local rpm/ directory to S3 so the builder can download it
    // This runs on every deploy, keeping build sources up to date before the instance starts
    new s3deploy.BucketDeployment(this, 'RpmBuildSources', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../rpm'))],
      destinationBucket: rpmBucket,
      destinationKeyPrefix: 'build-sources/',
      prune: false,
    });

    // Optional: custom AMI via context (default: latest Rocky Linux 9)
    const amiOverride = this.node.tryGetContext('builderAmi') as string | undefined;
    const ami = amiOverride
      ? ec2.MachineImage.genericLinux({ [this.region]: amiOverride })
      : ec2.MachineImage.lookup({
          name: 'Rocky-9-EC2-Base-9.*x86_64*',
          owners: ['679593333241'],
          filters: {
            architecture: ['x86_64'],
            'virtualization-type': ['hvm'],
            'root-device-type': ['ebs'],
          },
        });

    const instanceRole = new iam.Role(this, 'BuilderRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        // SSM Session Manager for debugging without SSH
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    });

    rpmBucket.grantReadWrite(instanceRole);

    // Allow self-termination — scoped to instances tagged Project=agent-enforcer-rpm-builder
    instanceRole.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['ec2:TerminateInstances'],
      resources: ['*'],
      conditions: {
        StringEquals: { 'ec2:ResourceTag/Project': 'agent-enforcer-rpm-builder' },
      },
    }));

    const vpc = ec2.Vpc.fromLookup(this, 'DefaultVpc', { isDefault: true });

    const sg = new ec2.SecurityGroup(this, 'BuilderSg', {
      vpc,
      description: 'RPM builder - outbound only',
      allowAllOutbound: true,
    });

    // buildTimestamp context forces a new EC2 instance on each deploy
    // (userDataCausesReplacement: true replaces the terminated instance)
    const buildTimestamp = this.node.tryGetContext('buildTimestamp') as string | undefined ?? 'initial';

    const userDataScript = [
      '#!/bin/bash',
      `# Build ID: ${buildTimestamp}`,
      'set -euxo pipefail',
      'exec > >(tee /var/log/rpm-build.log) 2>&1',
      'echo "=== Agent Enforcer RPM Builder starting at $(date) ==="',
      '',
      '# Install build tools',
      'dnf install -y rpm-build rpmdevtools systemd-rpm-macros curl unzip',
      '',
      '# AWS CLI v2',
      'curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip',
      'unzip -q /tmp/awscliv2.zip -d /tmp',
      '/tmp/aws/install',
      '',
      '# IMDSv2 instance ID',
      'TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")',
      'INSTANCE_ID=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-id)',
      '',
      '# Download RPM build sources from S3',
      'mkdir -p /root/rpmbuild',
      `aws s3 sync "s3://${RPM_BUCKET}/build-sources/" /root/rpmbuild/ --region "${this.region}"`,
      'echo "Sources downloaded:"',
      'find /root/rpmbuild -type f | sort',
      '',
      '# Build RPM',
      'rpmbuild -bb /root/rpmbuild/SPECS/agent-enforcer.spec --define "_topdir /root/rpmbuild"',
      '',
      '# Find and upload built RPM',
      'RPM_FILE=$(find /root/rpmbuild/RPMS/ -name "*.rpm" | head -1)',
      'RPM_BASENAME=$(basename $RPM_FILE)',
      `aws s3 cp "$RPM_FILE" "s3://${RPM_BUCKET}/$RPM_BASENAME" --region "${this.region}"`,
      `echo "SUCCESS: s3://${RPM_BUCKET}/$RPM_BASENAME"`,
      '',
      '# Upload build log',
      `TIMESTAMP=$(date -u +%Y%m%d-%H%M%S)`,
      `aws s3 cp /var/log/rpm-build.log "s3://${RPM_BUCKET}/build-logs/$TIMESTAMP.log" --region "${this.region}"`,
      '',
      '# Self-destruct',
      `aws ec2 terminate-instances --instance-ids $INSTANCE_ID --region "${this.region}"`,
    ].join('\n');

    const userData = ec2.UserData.forLinux();
    userData.addCommands(userDataScript);

    const builderInstance = new ec2.Instance(this, 'RpmBuilder', {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.SMALL),
      machineImage: ami,
      securityGroup: sg,
      role: instanceRole,
      userData,
      userDataCausesReplacement: true,
      blockDevices: [{
        deviceName: '/dev/sda1',
        volume: ec2.BlockDeviceVolume.ebs(20),
      }],
    });
    cdk.Tags.of(builderInstance).add('Project', 'agent-enforcer-rpm-builder');
    builderInstance.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    new cdk.CfnOutput(this, 'BuilderInstanceId', {
      value: builderInstance.instanceId,
      description: 'RPM builder EC2 instance ID - monitor via aws ec2 describe-instances',
    });
    new cdk.CfnOutput(this, 'RpmBucketUrl', {
      value: `s3://${RPM_BUCKET}/`,
      description: 'Check for built RPM here after ~5 minutes',
    });
  }
}
