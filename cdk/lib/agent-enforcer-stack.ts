import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import { Construct } from 'constructs';

export class AgentEnforcerStack extends cdk.Stack {
  public readonly enforcementDistBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Private source bucket — upload enforcement docs here to trigger generation
    const sourceBucket = new s3.Bucket(this, 'EnforcementSource', {
      bucketName: `agent-enforcer-source-${this.account}`,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Public distribution bucket — RPM agents sync from here
    this.enforcementDistBucket = new s3.Bucket(this, 'EnforcementDist', {
      bucketName: `agent-enforcer-dist-${this.account}`,
      versioned: true,
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

    // Lambda: reads enforcement doc, calls Bedrock, writes .claude/ bundle to dist bucket
    const configGeneratorFn = new lambda.Function(this, 'ConfigGenerator', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambda/config-generator')),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        DIST_BUCKET: this.enforcementDistBucket.bucketName,
        BEDROCK_MODEL_ID: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
        AWS_ACCOUNT_REGION: this.region,
      },
    });

    sourceBucket.grantRead(configGeneratorFn);
    this.enforcementDistBucket.grantWrite(configGeneratorFn);
    // Cross-region inference profiles route across multiple AWS regions,
    // so the resource must be '*' — there's no single-region ARN to scope to.
    configGeneratorFn.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['bedrock:InvokeModel'],
      resources: ['*'],
    }));

    // Trigger config generation whenever a doc is uploaded to source bucket
    sourceBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED_PUT,
      new s3n.LambdaDestination(configGeneratorFn),
    );

    // Seed default enforcement doc on deploy — triggers the Lambda automatically
    new s3deploy.BucketDeployment(this, 'DefaultEnforcementDoc', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../assets'))],
      destinationBucket: sourceBucket,
      prune: false,
    });

    new cdk.CfnOutput(this, 'EnforcementSourceBucket', { value: sourceBucket.bucketName });
    new cdk.CfnOutput(this, 'EnforcementDistBucket', { value: this.enforcementDistBucket.bucketName });
  }
}
