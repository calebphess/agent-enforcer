import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2int from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Construct } from 'constructs';

export class AgentEnforcerStack extends cdk.Stack {
  // Exported for DemoStack — resolves to the API Gateway base URL at deploy time
  public readonly apiEndpoint: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // -------------------------------------------------------------------------
    // S3 Buckets
    // -------------------------------------------------------------------------

    // Private source bucket — upload enforcement docs here to trigger generation
    const sourceBucket = new s3.Bucket(this, 'EnforcementSource', {
      bucketName: `agent-enforcer-source-${this.account}`,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Private distribution bucket — access only via Lambda-generated presigned URLs
    // (no longer public; agents authenticate through the license API)
    const distBucket = new s3.Bucket(this, 'EnforcementDist', {
      bucketName: `agent-enforcer-dist-${this.account}`,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // -------------------------------------------------------------------------
    // DynamoDB — License Registry
    // -------------------------------------------------------------------------

    const licenseTable = new dynamodb.Table(this, 'LicenseTable', {
      tableName: 'AgentEnforcerLicenses',
      partitionKey: { name: 'license_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // GSI for listing/querying licenses by user_id
    licenseTable.addGlobalSecondaryIndex({
      indexName: 'UserIndex',
      partitionKey: { name: 'user_id', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // -------------------------------------------------------------------------
    // Secrets Manager — Config
    // -------------------------------------------------------------------------

    const configSecret = new secretsmanager.Secret(this, 'AgentEnforcerConfig', {
      secretName: 'agent-enforcer/config',
      description: 'Agent Enforcer runtime configuration',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ max_licenses: 250 }),
        generateStringKey: '_placeholder',  // required field, unused
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // -------------------------------------------------------------------------
    // License Lambda + API Gateway
    // -------------------------------------------------------------------------

    const licenseFn = new lambda.Function(this, 'LicenseFn', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambda/license')),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        LICENSE_TABLE: licenseTable.tableName,
        DIST_BUCKET: distBucket.bucketName,
        CONFIG_SECRET_ARN: configSecret.secretArn,
      },
    });

    licenseTable.grantReadWriteData(licenseFn);
    distBucket.grantRead(licenseFn);
    configSecret.grantRead(licenseFn);

    // HTTP API v2 — cheaper than REST API, built-in CORS
    const httpApi = new apigwv2.HttpApi(this, 'LicenseApi', {
      apiName: 'agent-enforcer-api',
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigwv2.CorsHttpMethod.POST],
        allowHeaders: ['Content-Type'],
      },
      defaultAuthorizer: undefined,
    });

    const lambdaIntegration = new apigwv2int.HttpLambdaIntegration('LicenseIntegration', licenseFn);

    httpApi.addRoutes({
      path: '/agent-enforcer/register',
      methods: [apigwv2.HttpMethod.POST],
      integration: lambdaIntegration,
    });

    httpApi.addRoutes({
      path: '/agent-enforcer/sync',
      methods: [apigwv2.HttpMethod.POST],
      integration: lambdaIntegration,
    });

    // Set throttling on the auto-created default stage via escape hatch
    const defaultStage = httpApi.defaultStage!.node.defaultChild as apigwv2.CfnStage;
    defaultStage.defaultRouteSettings = {
      throttlingBurstLimit: 100,
      throttlingRateLimit: 50,
    };

    this.apiEndpoint = httpApi.url!;

    // -------------------------------------------------------------------------
    // Config Generator Lambda
    // -------------------------------------------------------------------------

    const configGeneratorFn = new lambda.Function(this, 'ConfigGenerator', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambda/config-generator')),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        DIST_BUCKET: distBucket.bucketName,
        BEDROCK_MODEL_ID: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
        AWS_ACCOUNT_REGION: this.region,
      },
    });

    sourceBucket.grantRead(configGeneratorFn);
    distBucket.grantReadWrite(configGeneratorFn);
    // Cross-region inference profiles route across multiple AWS regions,
    // so the resource must be '*' — there's no single-region ARN to scope to.
    configGeneratorFn.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['bedrock:InvokeModel'],
      resources: ['*'],
    }));

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

    // -------------------------------------------------------------------------
    // Outputs
    // -------------------------------------------------------------------------

    new cdk.CfnOutput(this, 'EnforcementSourceBucket', { value: sourceBucket.bucketName });
    new cdk.CfnOutput(this, 'EnforcementDistBucket', { value: distBucket.bucketName });
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: httpApi.url!,
      description: 'Agent Enforcer API base URL — pass to agent --endpoint flag',
    });
    new cdk.CfnOutput(this, 'LicenseTableName', { value: licenseTable.tableName });
    new cdk.CfnOutput(this, 'ConfigSecretArn', { value: configSecret.secretArn });
  }
}
