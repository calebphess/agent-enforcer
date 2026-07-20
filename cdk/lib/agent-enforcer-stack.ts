import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
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
        DOCUMENTS_TABLE: documentsTable.tableName,
      },
    });

    licenseTable.grantReadWriteData(licenseFn);
    distBucket.grantRead(licenseFn);
    configSecret.grantRead(licenseFn);
    // Sync response includes the per-assistant toggles for `agent-enforcer describe`
    documentsTable.grantReadData(licenseFn);

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
        DIST_BUCKET: distBucket.bucketName,
        CONFIG_SECRET_ARN: configSecret.secretArn,
      },
    });

    documentsTable.grantReadWriteData(adminFn);
    // Write needed for agent deregistration (deactivate license + counter)
    licenseTable.grantReadWriteData(adminFn);
    configSecret.grantRead(adminFn);
    // Presigned URLs are signed with the Lambda role's credentials, so the
    // role itself needs put (uploads) and read (downloads); document deletes
    // remove the source object
    sourceBucket.grantPut(adminFn);
    sourceBucket.grantDelete(adminFn);
    sourceBucket.grantRead(adminFn);
    // Bundle viewer lists + reads generated configs
    distBucket.grantRead(adminFn);

    const adminIntegration = new apigwv2int.HttpLambdaIntegration('AdminIntegration', adminFn);
    const adminRoutes: Record<string, apigwv2.HttpMethod[]> = {
      '/admin/login': [apigwv2.HttpMethod.POST],
      '/admin/documents': [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
      '/admin/documents/{id}': [apigwv2.HttpMethod.PUT, apigwv2.HttpMethod.DELETE],
      '/admin/documents/{id}/upload-url': [apigwv2.HttpMethod.POST],
      '/admin/documents/{id}/download-url': [apigwv2.HttpMethod.POST],
      '/admin/stats': [apigwv2.HttpMethod.GET],
      '/admin/agents': [apigwv2.HttpMethod.GET],
      '/admin/agents/{id}': [apigwv2.HttpMethod.DELETE],
      '/admin/assistants': [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.PUT],
      '/admin/assistants/{assistant}/bundle': [apigwv2.HttpMethod.GET],
      // Greedy — bundle paths nest (skills/foo.md); the Lambda unquotes
      '/admin/assistants/{assistant}/bundle/{path+}': [apigwv2.HttpMethod.GET],
    };
    for (const [routePath, methods] of Object.entries(adminRoutes)) {
      httpApi.addRoutes({ path: routePath, methods, integration: adminIntegration });
    }

    // Static admin console — ui/ holds the Next.js source; CDK bundling builds
    // the static export at synth. Two serving modes, one website bucket:
    //
    //  - Private (default): a Route 53 PRIVATE hosted zone (`uiInternalDomain`,
    //    default agent-enforcer.internal) anchored to a $0 micro-VPC (or an
    //    existing VPC via `-c uiVpcId`), with ui.<domain> CNAME'd to the S3
    //    website endpoint. S3 virtual hosting requires host == bucket name, so
    //    the bucket is named ui.<domain> in this mode. The name only resolves
    //    inside associated VPCs — the UiWebsiteEndpoint output always works.
    //  - Public (`-c uiDomain=demo.agent-enforcer.com`): CloudFront + ACM cert
    //    DNS-validated in the parent public zone + A/AAAA aliases.
    //
    // Same public-read dev posture as the demo results bucket either way.
    const uiDomain: string | undefined = this.node.tryGetContext('uiDomain');
    const internalDomain: string =
      this.node.tryGetContext('uiInternalDomain') ?? 'agent-enforcer.internal';
    const uiBucketName =
      this.node.tryGetContext('uiBucketName') ??
      (uiDomain ? `agent-enforcer-ui-${this.account}` : `ui.${internalDomain}`);

    const uiBucket = new s3.Bucket(this, 'AdminUi', {
      bucketName: uiBucketName,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: '404.html',  // emitted by the Next static export
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

    let distribution: cloudfront.Distribution | undefined;
    if (uiDomain) {
      if (this.region !== 'us-east-1') {
        throw new Error('uiDomain requires us-east-1 (CloudFront certificates live there)');
      }
      const parentZoneName = uiDomain.split('.').slice(1).join('.');
      if (!parentZoneName.includes('.')) {
        throw new Error(
          `uiDomain must be a subdomain of a hosted zone you own (got '${uiDomain}', e.g. demo.agent-enforcer.com)`,
        );
      }
      const publicZone = route53.HostedZone.fromLookup(this, 'UiPublicZone', {
        domainName: parentZoneName,
      });
      const certificate = new acm.Certificate(this, 'UiCertificate', {
        domainName: uiDomain,
        validation: acm.CertificateValidation.fromDns(publicZone),
      });
      distribution = new cloudfront.Distribution(this, 'UiDistribution', {
        defaultBehavior: {
          // Website endpoint (not REST) so S3 keeps handling directory index
          // documents and the 404 error page
          origin: new origins.S3StaticWebsiteOrigin(uiBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        domainNames: [uiDomain],
        certificate,
      });
      const aliasTarget = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution));
      new route53.ARecord(this, 'UiAliasRecord', {
        zone: publicZone,
        recordName: uiDomain,
        target: aliasTarget,
      });
      new route53.AaaaRecord(this, 'UiAliasRecordV6', {
        zone: publicZone,
        recordName: uiDomain,
        target: aliasTarget,
      });
    } else {
      const uiVpcId: string | undefined = this.node.tryGetContext('uiVpcId');
      const dnsVpc = uiVpcId
        ? ec2.Vpc.fromLookup(this, 'UiDnsVpc', { vpcId: uiVpcId })
        : new ec2.Vpc(this, 'UiDnsVpc', {
            // DNS anchor only — no NAT/IGW/endpoints, so it bills nothing.
            // Customers associate their real VPCs with the zone post-deploy.
            ipAddresses: ec2.IpAddresses.cidr('10.255.255.0/28'),
            maxAzs: 1,
            natGateways: 0,
            subnetConfiguration: [
              { name: 'dns', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 28 },
            ],
            restrictDefaultSecurityGroup: false,
          });
      const internalZone = new route53.PrivateHostedZone(this, 'UiInternalZone', {
        zoneName: internalDomain,
        vpc: dnsVpc,
      });
      new route53.CnameRecord(this, 'UiInternalRecord', {
        zone: internalZone,
        recordName: 'ui',
        domainName: uiBucket.bucketWebsiteDomainName,
      });
    }

    // Build the Next.js static export at synth time. Local bundling runs pnpm
    // straight from npx; the Docker image is the fallback (e.g. no node on
    // PATH). `exclude` keeps the asset hash driven by source files only.
    const uiDir = path.join(__dirname, '../../ui');
    const uiBuildCmds = [
      'npx -y pnpm@10 install --frozen-lockfile',
      'npx -y pnpm@10 run build',
    ];
    const uiSource = s3deploy.Source.asset(uiDir, {
      exclude: ['node_modules', '.next', 'out'],
      bundling: {
        image: cdk.DockerImage.fromRegistry('public.ecr.aws/docker/library/node:22'),
        command: ['bash', '-c', [...uiBuildCmds, 'cp -a out/. /asset-output/'].join(' && ')],
        environment: { NEXT_TELEMETRY_DISABLED: '1' },
        local: {
          tryBundle(outputDir: string): boolean {
            try {
              for (const cmd of uiBuildCmds) {
                execSync(cmd, {
                  cwd: uiDir,
                  stdio: 'inherit',
                  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
                });
              }
              fs.cpSync(path.join(uiDir, 'out'), outputDir, { recursive: true });
              return true;
            } catch (err) {
              console.warn(`Local UI build failed, falling back to Docker: ${err}`);
              return false;
            }
          },
        },
      },
    });

    new s3deploy.BucketDeployment(this, 'AdminUiDeployment', {
      sources: [
        uiSource,
        // Runtime config — listed after the asset so it wins over the
        // public/config.js dev stub
        s3deploy.Source.data('config.js', `window.__AE_CONFIG__={apiBase:"${httpApi.url}"}`),
      ],
      destinationBucket: uiBucket,
      ...(distribution ? { distribution, distributionPaths: ['/*'] } : {}),
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
      value: uiDomain ? `https://${uiDomain}` : `http://ui.${internalDomain}`,
      description: 'Admin console URL (default login admin/password — override in the config secret)',
    });
    new cdk.CfnOutput(this, 'UiWebsiteEndpoint', {
      value: uiBucket.bucketWebsiteUrl,
      description: 'Direct S3 website endpoint — always reachable; the .internal name resolves only inside associated VPCs',
    });
  }
}
