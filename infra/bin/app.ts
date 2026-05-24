import 'source-map-support/register';
import { App, Aspects, Tags } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SearchStack } from '../lib/stacks/search-stack.js';
import { AdminConsoleStack } from '../lib/stacks/admin-console-stack.js';
import { applyV1NagSuppressions } from '../lib/nag-suppressions.js';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');

const app = new App();

const props = process.env.CDK_DEFAULT_ACCOUNT && process.env.CDK_DEFAULT_REGION
  ? {
      env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION
      }
    }
  : {};

const enableSearxng = app.node.tryGetContext('enableSearxng') === true || app.node.tryGetContext('enableSearxng') === 'true';

const search = new SearchStack(app, 'SearchGatewayStack-v1-0', { ...props, enableSearxng });

Tags.of(search).add('project', 'search-agentcore-gateway');
Tags.of(search).add('environment', app.node.tryGetContext('env') ?? 'dev');

Aspects.of(search).add(new AwsSolutionsChecks({ verbose: true }));

// Admin Console Stack
const adminAssetPath = resolve(__dirname, '../../packages/admin-console/dist');
const admin = new AdminConsoleStack(app, 'AdminConsoleStack-v1-0', {
  ...props,
  vpc: search.vpc,
  configTable: search.configTable,
  searchRouterFn: search.searchRouter.fn,
  secretsKmsKey: search.kmsSecretsKey,
  adminAssetPath: existsSync(adminAssetPath) ? adminAssetPath : resolve(__dirname, '../test/fixtures/admin-asset')
});

Tags.of(admin).add('project', 'search-agentcore-gateway');
Tags.of(admin).add('environment', app.node.tryGetContext('env') ?? 'dev');

Aspects.of(admin).add(new AwsSolutionsChecks({ verbose: true }));

// Apply v1.0 NAG suppressions to admin stack
applyV1NagSuppressions(admin);
