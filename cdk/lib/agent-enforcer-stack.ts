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

    // Documents registry for the admin UI — tracks enforcement docs in the
    // source bucket, plus the special SETTINGS item holding per-assistant
    // generation toggles (mirrors the license table's COUNTER convention)
    const documentsTable = new dynamodb.Table(this, 'DocumentsTable', {
      tableName: 'AgentEnforcerDocuments',
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // -------------------------------------------------------------------------
    // Secrets Manager — Config
    // -------------------------------------------------------------------------

    const configSecret = new secretsmanager.Secret(this, 'AgentEnforcerConfig', {
      secretName: 'agent-enforcer/config',
      description: 'Agent Enforcer runtime configuration',
      generateSecretString: {
        // Applied at secret CREATION only — CloudFormation never rewrites an
        // existing secret's value from this template. The admin Lambda carries
        // the same admin/password defaults in code for stacks whose secret
        // predates these keys.
        secretStringTemplate: JSON.stringify({
          max_licenses: 250,
          admin_username: 'admin',
          admin_password: 'password',
        }),
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
        // Browser-based admin UI needs the full method set + Authorization.
        // CORS config is API-wide on HTTP API v2 — harmless to the
        // curl-based /agent-enforcer/* routes.
        allowOrigins: ['*'],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.DELETE,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['Content-Type', 'Authorization'],
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
        DOCUMENTS_TABLE: documentsTable.tableName,
      },
    });

    sourceBucket.grantRead(configGeneratorFn);
    distBucket.grantReadWrite(configGeneratorFn);
    // Reads SETTINGS for the per-assistant toggle; writes registry records
    // for docs uploaded directly to S3 (aws s3 cp)
    documentsTable.grantReadWriteData(configGeneratorFn);
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

    // Deletes regenerate too, so removing a document via the admin UI (or CLI)
    // drops its rules from the bundle instead of leaving them stale
    sourceBucket.addEventNotification(
      s3.EventType.OBJECT_REMOVED,
      new s3n.LambdaDestination(configGeneratorFn),
    );

    // Seed default enforcement doc on deploy — triggers the Lambda automatically
    new s3deploy.BucketDeployment(this, 'DefaultEnforcementDoc', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../assets'))],
      destinationBucket: sourceBucket,
      prune: false,
    });

    // -------------------------------------------------------------------------
    // Admin Web UI — API Lambda + static site hosting
    // -------------------------------------------------------------------------

    const adminFn = new lambda.Function(this, 'AdminFn', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambda/admin')),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        LICENSE_TABLE: licenseTable.tableName,
        DOCUMENTS_TABLE: documentsTable.tableName,
        SOURCE_BUCKET: sourceBucket.bucketName,
        CONFIG_SECRET_ARN: configSecret.secretArn,
      },
    });

    documentsTable.grantReadWriteData(adminFn);
    licenseTable.grantReadData(adminFn);
    configSecret.grantRead(adminFn);
    // Presigned upload URLs are signed with the Lambda role's credentials, so
    // the role itself needs put; document deletes remove the source object
    sourceBucket.grantPut(adminFn);
    sourceBucket.grantDelete(adminFn);

    const adminIntegration = new apigwv2int.HttpLambdaIntegration('AdminIntegration', adminFn);
    const adminRoutes: Record<string, apigwv2.HttpMethod[]> = {
      '/admin/login': [apigwv2.HttpMethod.POST],
      '/admin/documents': [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
      '/admin/documents/{id}': [apigwv2.HttpMethod.PUT, apigwv2.HttpMethod.DELETE],
      '/admin/documents/{id}/upload-url': [apigwv2.HttpMethod.POST],
      '/admin/stats': [apigwv2.HttpMethod.GET],
      '/admin/agents': [apigwv2.HttpMethod.GET],
      '/admin/assistants': [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.PUT],
    };
    for (const [routePath, methods] of Object.entries(adminRoutes)) {
      httpApi.addRoutes({ path: routePath, methods, integration: adminIntegration });
    }

    // Static admin console — bucket name comes from config (cdk context key
    // `uiBucketName`); contents are the V0 static export dropped into ui/
    // (placeholder page until then). Same public-read dev posture as the demo
    // results bucket; CloudFront is the prod path for HTTPS.
    const uiBucketName =
      this.node.tryGetContext('uiBucketName') ?? `agent-enforcer-ui-${this.account}`;
    const uiBucket = new s3.Bucket(this, 'AdminUi', {
      bucketName: uiBucketName,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',  // SPA fallback for client-side routes
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

    new s3deploy.BucketDeployment(this, 'AdminUiDeployment', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../ui'))],
      destinationBucket: uiBucket,
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
    new cdk.CfnOutput(this, 'DocumentsTableName', { value: documentsTable.tableName });
    new cdk.CfnOutput(this, 'UiUrl', {
      value: uiBucket.bucketWebsiteUrl,
      description: 'Admin console URL (default login admin/password — override in the config secret)',
    });
  }
}
