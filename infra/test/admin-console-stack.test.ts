import { Template, Match } from 'aws-cdk-lib/assertions';
import { App, Stack } from 'aws-cdk-lib';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { Table, AttributeType } from 'aws-cdk-lib/aws-dynamodb';
import { Function, Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { Key } from 'aws-cdk-lib/aws-kms';
import { describe, it, expect } from 'vitest';
import { AdminConsoleStack } from '../lib/stacks/admin-console-stack.js';
import { resolve } from 'node:path';

describe('AdminConsoleStack', () => {
  it('creates Lambda + Function URL + CloudFront + WAF', () => {
    const app = new App();

    // Build a parent stack with the dependencies the admin stack needs
    const parent = new Stack(app, 'Parent', {
      env: { account: '111111111111', region: 'us-east-1' }
    });

    const vpc = new Vpc(parent, 'Vpc');
    const configTable = new Table(parent, 'ConfigTable', {
      partitionKey: { name: 'providerId', type: AttributeType.STRING }
    });
    const router = new Function(parent, 'Router', {
      runtime: Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: Code.fromInline('exports.handler=()=>{};')
    });
    const key = new Key(parent, 'Key');

    // Use test fixture path
    const fixtureAssetPath = resolve(__dirname, './fixtures/admin-asset');

    const s = new AdminConsoleStack(app, 'AdminConsole', {
      env: { account: '111111111111', region: 'us-east-1' },
      vpc,
      configTable,
      searchRouterFn: router,
      secretsKmsKey: key,
      adminAssetPath: fixtureAssetPath
    });

    const t = Template.fromStack(s);

    // Verify Lambda function exists
    t.resourceCountIs('AWS::Lambda::Function', 1);
    t.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs20.x',
      MemorySize: 1024,
      Timeout: 15
    });

    // Verify Function URL exists
    t.hasResourceProperties('AWS::Lambda::Url', {
      AuthType: 'AWS_IAM'
    });

    // Verify CloudFront distribution exists
    t.resourceCountIs('AWS::CloudFront::Distribution', 1);

    // Verify WAF WebACL exists
    t.resourceCountIs('AWS::WAFv2::WebACL', 1);
    t.hasResourceProperties('AWS::WAFv2::WebACL', {
      Scope: 'CLOUDFRONT',
      DefaultAction: { Allow: {} }
    });

    // Verify outputs exist
    t.hasOutput('AdminDistDomainName', {});
    t.hasOutput('AdminFunctionUrl', {});
  });
});
