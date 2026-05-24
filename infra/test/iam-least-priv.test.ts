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
    const allBedrockActions: string[] = [];
    const workloadIdentityStatements: any[] = [];
    for (const [, policy] of Object.entries(policies)) {
      const statements = (policy as any).Properties?.PolicyDocument?.Statement ?? [];
      for (const stmt of statements) {
        const actions = (stmt.Action && (Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action])) || [];
        const bedrockActions = actions.filter((a: string) => typeof a === 'string' && a.includes('bedrock-agentcore'));
        if (bedrockActions.length > 0) {
          allBedrockActions.push(...bedrockActions);
          if (bedrockActions.some((a: string) => a.includes('WorkloadIdentity'))) {
            workloadIdentityStatements.push(stmt);
          }
        }
      }
    }
    expect(allBedrockActions.length, 'Should have bedrock-agentcore actions in some policy').toBeGreaterThan(0);
    const combined = JSON.stringify(allBedrockActions);
    expect(combined).toMatch(/bedrock-agentcore:(CreateGateway|DeleteGateway|CreateGatewayTarget|DeleteGatewayTarget|GetGateway)/);
    // WorkloadIdentity actions must be scoped to a workload-identity ARN, not '*'.
    expect(workloadIdentityStatements.length, 'WorkloadIdentity actions should be in their own scoped statement').toBeGreaterThan(0);
    for (const stmt of workloadIdentityStatements) {
      const resources = (stmt.Resource && (Array.isArray(stmt.Resource) ? stmt.Resource : [stmt.Resource])) || [];
      const resourceStr = JSON.stringify(resources);
      expect(resourceStr, 'WorkloadIdentity statement must reference workload-identity ARN').toContain('workload-identity');
    }
  });
});
