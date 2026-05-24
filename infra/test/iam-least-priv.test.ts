import { describe, it, expect } from 'vitest';
import { Template } from 'aws-cdk-lib/assertions';
import { App, Stack } from 'aws-cdk-lib';
import { AgentCoreGateway } from '../lib/gateway/agentcore-gateway.js';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Function, Runtime, Code } from 'aws-cdk-lib/aws-lambda';

describe('IAM least privilege hardening', () => {
  it('gateway custom resource roles do not attach AWSLambdaBasicExecutionRole', () => {
    const app = new App();
    const stack = new Stack(app, 'Test', {
      env: { account: '111111111111', region: 'us-east-1' }
    });

    // Create a minimal lambda for testing
    const mockFn = new Function(stack, 'MockFn', {
      runtime: Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: Code.fromInline('exports.handler = async () => {}')
    });

    // Create the gateway
    new AgentCoreGateway(stack, 'Gateway', {
      routerFn: mockFn,
      toolDefinitions: [],
      cognitoDiscoveryUrl: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TEST/.well-known/openid-configuration',
      cognitoClientId: 'testclient'
    });

    const t = Template.fromStack(stack);
    const roles = t.findResources('AWS::IAM::Role');
    // Check only gateway-related roles (not the Lambda's default role)
    for (const [roleName, role] of Object.entries(roles)) {
      if (roleName.includes('CreateGateway') || roleName.includes('CreateTarget') || roleName.includes('InvokeRole')) {
        const arns = (role as any).Properties?.ManagedPolicyArns ?? [];
        const flatArns = JSON.stringify(arns);
        expect(flatArns, `Gateway role ${roleName} should not have AWSLambdaBasicExecutionRole`).not.toContain('AWSLambdaBasicExecutionRole');
      }
    }
  });

  it('bedrock-agentcore Create/Delete actions are present with appropriate permissions', () => {
    const app = new App();
    const stack = new Stack(app, 'Test', {
      env: { account: '111111111111', region: 'us-east-1' }
    });

    // Create a minimal lambda for testing
    const mockFn = new Function(stack, 'MockFn', {
      runtime: Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: Code.fromInline('exports.handler = async () => {}')
    });

    // Create the gateway
    new AgentCoreGateway(stack, 'Gateway', {
      routerFn: mockFn,
      toolDefinitions: [],
      cognitoDiscoveryUrl: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TEST/.well-known/openid-configuration',
      cognitoClientId: 'testclient'
    });

    const t = Template.fromStack(stack);
    const policies = t.findResources('AWS::IAM::Policy');
    let foundBedrockPolicy = false;
    for (const [policyName, policy] of Object.entries(policies)) {
      const statements = (policy as any).Properties?.PolicyDocument?.Statement ?? [];
      for (const stmt of statements) {
        const actions = stmt.Action && (Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action]) || [];
        const hasBedrockActions = actions.some((a: string) => typeof a === 'string' && a.includes('bedrock-agentcore'));
        if (hasBedrockActions) {
          foundBedrockPolicy = true;
          // Verify that the policy has bedrock-agentcore actions
          const actionStr = JSON.stringify(actions);
          expect(actionStr).toMatch(/bedrock-agentcore:(CreateGateway|DeleteGateway|CreateTarget|DeleteTarget)/);
        }
      }
    }
    expect(foundBedrockPolicy, 'Should have a policy with bedrock-agentcore actions').toBe(true);
  });
});
