import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2int from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';

const APEX_DOMAIN = 'agent-enforcer.com';
const WWW_DOMAIN = `www.${APEX_DOMAIN}`;
const CONTACT_EMAIL = 'contact@alchemistfederal.com';

/**
 * Public marketing site (ui/product-page/) + contact-form backend.
 *
 * Deliberately its own stack with its own deploy/destroy lifecycle
 * (npm run deploy:showcase / destroy:showcase) — unlike AgentEnforcerStack,
 * DemoStack, and RpmBuilderStack, this sits on the real public apex domain
 * agent-enforcer.com, so it is NOT part of deploy:all/destroy:all. Routine
 * dev-sandbox iteration on the other stacks should never tear this down.
 */
export class ShowcaseStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    if (this.region !== 'us-east-1') {
      throw new Error('ShowcaseStack requires us-east-1 (CloudFront certificates live there)');
    }

    // -------------------------------------------------------------------------
    // Contact backend — SNS topic (emails CONTACT_EMAIL) + Lambda + API Gateway
    // -------------------------------------------------------------------------

    const contactTopic = new sns.Topic(this, 'ContactTopic', {
      topicName: 'agent-enforcer-contact-requests',
      displayName: 'Agent Enforcer contact requests',
    });
    // SNS email subscriptions require a one-time manual confirmation click
    // sent to CONTACT_EMAIL after the first deploy — cannot be automated.
    contactTopic.addSubscription(new subscriptions.EmailSubscription(CONTACT_EMAIL));

    const contactFn = new lambda.Function(this, 'ContactFn', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambda/contact')),
      timeout: cdk.Duration.seconds(15),
      memorySize: 128,
      environment: {
        CONTACT_TOPIC_ARN: contactTopic.topicArn,
      },
    });
    contactTopic.grantPublish(contactFn);

    const contactApi = new apigwv2.HttpApi(this, 'ShowcaseApi', {
      apiName: 'agent-enforcer-showcase-api',
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigwv2.CorsHttpMethod.POST, apigwv2.CorsHttpMethod.OPTIONS],
        allowHeaders: ['Content-Type'],
      },
    });
    contactApi.addRoutes({
      path: '/contact',
      methods: [apigwv2.HttpMethod.POST],
      integration: new apigwv2int.HttpLambdaIntegration('ContactIntegration', contactFn),
    });

    // Small public form — tighter throttle than the license/admin API
    const defaultStage = contactApi.defaultStage!.node.defaultChild as apigwv2.CfnStage;
    defaultStage.defaultRouteSettings = {
      throttlingBurstLimit: 20,
      throttlingRateLimit: 10,
    };

    // -------------------------------------------------------------------------
    // Public site bucket — same public-read website-hosting posture as the
    // admin console's UI bucket (see agent-enforcer-stack.ts)
    // -------------------------------------------------------------------------

    const siteBucket = new s3.Bucket(this, 'ShowcaseSite', {
      bucketName: `agent-enforcer-showcase-${this.account}`,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: '404.html', // emitted by the Next static export
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

    // agent-enforcer.com already exists as a Route 53 public hosted zone in
    // this account (confirmed via `aws route53 list-hosted-zones`)
    const zone = route53.HostedZone.fromLookup(this, 'ShowcaseZone', {
      domainName: APEX_DOMAIN,
    });

    // One cert covers both the apex and the www redirect distribution below
    const certificate = new acm.Certificate(this, 'ShowcaseCertificate', {
      domainName: APEX_DOMAIN,
      subjectAlternativeNames: [WWW_DOMAIN],
      validation: acm.CertificateValidation.fromDns(zone),
    });

    const distribution = new cloudfront.Distribution(this, 'ShowcaseDistribution', {
      defaultBehavior: {
        // Website endpoint (not REST) so S3 keeps handling directory index
        // documents and the 404 error page
        origin: new origins.S3StaticWebsiteOrigin(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      domainNames: [APEX_DOMAIN],
      certificate,
    });

    const apexAliasTarget = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution));
    new route53.ARecord(this, 'ShowcaseAliasRecord', {
      zone,
      recordName: APEX_DOMAIN,
      target: apexAliasTarget,
    });
    new route53.AaaaRecord(this, 'ShowcaseAliasRecordV6', {
      zone,
      recordName: APEX_DOMAIN,
      target: apexAliasTarget,
    });

    // -------------------------------------------------------------------------
    // www.agent-enforcer.com → agent-enforcer.com redirect
    //
    // A small bucket configured purely for S3 website redirect (no content,
    // no public-read bucket policy needed — a redirect response never reads
    // an object) fronted by its own CloudFront distribution, reusing the
    // same certificate. Standard AWS pattern for apex+www.
    // -------------------------------------------------------------------------

    const wwwRedirectBucket = new s3.Bucket(this, 'ShowcaseWwwRedirect', {
      bucketName: `agent-enforcer-showcase-www-redirect-${this.account}`,
      websiteRedirect: {
        hostName: APEX_DOMAIN,
        protocol: s3.RedirectProtocol.HTTPS,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const wwwDistribution = new cloudfront.Distribution(this, 'ShowcaseWwwDistribution', {
      defaultBehavior: {
        origin: new origins.S3StaticWebsiteOrigin(wwwRedirectBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      domainNames: [WWW_DOMAIN],
      certificate,
    });

    const wwwAliasTarget = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(wwwDistribution));
    new route53.ARecord(this, 'ShowcaseWwwAliasRecord', {
      zone,
      recordName: WWW_DOMAIN,
      target: wwwAliasTarget,
    });
    new route53.AaaaRecord(this, 'ShowcaseWwwAliasRecordV6', {
      zone,
      recordName: WWW_DOMAIN,
      target: wwwAliasTarget,
    });

    // -------------------------------------------------------------------------
    // Build the Next.js static export at synth time. Local bundling runs pnpm
    // straight from npx; the Docker image is the fallback (e.g. no node on
    // PATH) — same technique as the admin console (agent-enforcer-stack.ts).
    // -------------------------------------------------------------------------

    const siteDir = path.join(__dirname, '../../ui/product-page');
    const siteBuildCmds = [
      'npx -y pnpm@10 install --frozen-lockfile',
      'npx -y pnpm@10 run build',
    ];
    const siteSource = s3deploy.Source.asset(siteDir, {
      exclude: ['node_modules', '.next', 'out'],
      bundling: {
        image: cdk.DockerImage.fromRegistry('public.ecr.aws/docker/library/node:22'),
        command: ['bash', '-c', [...siteBuildCmds, 'cp -a out/. /asset-output/'].join(' && ')],
        environment: { NEXT_TELEMETRY_DISABLED: '1' },
        local: {
          tryBundle(outputDir: string): boolean {
            try {
              for (const cmd of siteBuildCmds) {
                execSync(cmd, {
                  cwd: siteDir,
                  stdio: 'inherit',
                  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
                });
              }
              fs.cpSync(path.join(siteDir, 'out'), outputDir, { recursive: true });
              return true;
            } catch (err) {
              console.warn(`Local showcase site build failed, falling back to Docker: ${err}`);
              return false;
            }
          },
        },
      },
    });

    new s3deploy.BucketDeployment(this, 'ShowcaseSiteDeployment', {
      sources: [
        siteSource,
        // Runtime config — listed after the asset so it wins over the
        // public/config.js dev stub
        s3deploy.Source.data('config.js', `window.__SHOWCASE_CONFIG__={apiBase:"${contactApi.url}"}`),
      ],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    // -------------------------------------------------------------------------
    // Outputs
    // -------------------------------------------------------------------------

    new cdk.CfnOutput(this, 'ShowcaseUrl', {
      value: `https://${APEX_DOMAIN}`,
      description: 'Public marketing site',
    });
    new cdk.CfnOutput(this, 'ShowcaseApiEndpoint', {
      value: contactApi.url!,
      description: 'Contact form API base URL',
    });
    new cdk.CfnOutput(this, 'ContactTopicArn', {
      value: contactTopic.topicArn,
      description: `SNS topic — confirm the email subscription sent to ${CONTACT_EMAIL} after first deploy`,
    });
  }
}
