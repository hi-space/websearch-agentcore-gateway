import { Construct } from 'constructs';
import { Duration, Stack } from 'aws-cdk-lib';
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
  PhysicalResourceIdReference
} from 'aws-cdk-lib/custom-resources';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { GatewayTargets } from './targets.js';
import { GatewayWaitForReady } from './wait-for-ready.js';

export interface GatewayProps {
  routerFn: IFunction;
  toolDefinitions: Array<{ name: string; description: string; inputSchema: unknown }>;
  cognitoDiscoveryUrl: string;
  cognitoClientId: string;
}

export class AgentCoreGateway extends Construct {
  readonly gatewayId: string;

  constructor(scope: Construct, id: string, props: GatewayProps) {
    super(scope, id);

    const invokeRole = new Role(this, 'InvokeRole', {
      assumedBy: new ServicePrincipal('bedrock-agentcore.amazonaws.com'),
      description: 'Allows AgentCore Gateway to invoke search-router Lambda'
    });
    invokeRole.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['lambda:InvokeFunction'],
      resources: [props.routerFn.functionArn]
    }));

    const gatewayRole = new Role(this, 'ExecutionRole', {
      assumedBy: new ServicePrincipal('bedrock-agentcore.amazonaws.com'),
      description: 'AgentCore Gateway execution role'
    });
    gatewayRole.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['lambda:InvokeFunction'],
      resources: [props.routerFn.functionArn]
    }));

    const create = new AwsCustomResource(this, 'CreateGateway', {
      onCreate: {
        service: 'bedrock-agentcore-control',
        action: 'createGateway',
        parameters: {
          name: `${Stack.of(this).stackName}-gw`,
          protocolType: 'MCP',
          roleArn: gatewayRole.roleArn,
          authorizerType: 'CUSTOM_JWT',
          authorizerConfiguration: {
            customJWTAuthorizer: {
              discoveryUrl: props.cognitoDiscoveryUrl,
              allowedClients: [props.cognitoClientId]
            }
          }
        },
        physicalResourceId: PhysicalResourceId.fromResponse('gatewayId')
      },
      onDelete: {
        service: 'bedrock-agentcore-control',
        action: 'deleteGateway',
        parameters: { gatewayIdentifier: new PhysicalResourceIdReference() }
      },
      policy: AwsCustomResourcePolicy.fromStatements([
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['bedrock-agentcore:CreateGateway', 'bedrock-agentcore:DeleteGateway'],
          resources: ['*']
        }),
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['iam:PassRole'],
          resources: [gatewayRole.roleArn]
        })
      ]),
      installLatestAwsSdk: false,
      timeout: Duration.minutes(5)
    });

    this.gatewayId = create.getResponseField('gatewayId');

    const wait = new GatewayWaitForReady(this, 'WaitReady', { gatewayId: this.gatewayId });
    wait.node.addDependency(create);

    const targets = new GatewayTargets(this, 'Targets', {
      gatewayId: this.gatewayId,
      routerFn: props.routerFn,
      invokeRole,
      tools: props.toolDefinitions
    });
    targets.node.addDependency(wait);
  }
}
