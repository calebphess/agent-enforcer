#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AgentEnforcerStack } from '../lib/agent-enforcer-stack';
import { DemoStack } from '../lib/demo-stack';
import { RpmBuilderStack } from '../lib/rpm-builder-stack';

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
