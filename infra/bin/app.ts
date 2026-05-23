import 'source-map-support/register';
import { App, Aspects, Tags } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { SearchGatewayStack } from '../lib/stack.js';

const app = new App();

const props = process.env.CDK_DEFAULT_ACCOUNT && process.env.CDK_DEFAULT_REGION
  ? {
      env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION
      }
    }
  : {};

const stack = new SearchGatewayStack(app, 'SearchGatewayStack-v1-0', props);

Tags.of(stack).add('project', 'search-agentcore-gateway');
Tags.of(stack).add('environment', app.node.tryGetContext('env') ?? 'dev');

Aspects.of(stack).add(new AwsSolutionsChecks({ verbose: true }));
