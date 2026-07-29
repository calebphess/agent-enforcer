#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AgentEnforcerStack } from '../lib/agent-enforcer-stack';
import { DemoStack } from '../lib/demo-stack';
import { RpmBuilderStack } from '../lib/rpm-builder-stack';
import { ShowcaseStack } from '../lib/showcase-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
};

const enforcerStack = new AgentEnforcerStack(app, 'AgentEnforcerStack', { env });

new DemoStack(app, 'DemoStack', {
  apiEndpoint: enforcerStack.apiEndpoint,
  env,
});

new RpmBuilderStack(app, 'RpmBuilderStack', { env });

// Public marketing site (agent-enforcer.com) + contact backend — own
// lifecycle (deploy:showcase/destroy:showcase). `cdk deploy --all` would
// include any stack registered in the app tree, so package.json's
// deploy:all/deploy:all:demo/destroy:all deliberately enumerate the other
// three stacks by name instead of using --all, to keep this one out.
new ShowcaseStack(app, 'ShowcaseStack', { env });
