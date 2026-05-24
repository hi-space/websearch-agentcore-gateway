import { Construct } from 'constructs';
import { Duration, Stack } from 'aws-cdk-lib';
import {
  AwsCustomResource,
  PhysicalResourceId,
  PhysicalResourceIdReference
} from 'aws-cdk-lib/custom-resources';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { GatewayTargets } from './targets.js';

export interface GatewayProps {
  routerFn: IFunction;
  toolDefinitions: Array<{ name: string; description: string; inputSchema: unknown }>;
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

    // Create explicit role for CreateGateway custom resource with least-privilege policy
    const createGatewayRole = new Role(this, 'CreateGatewayRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      description: 'Role for AgentCore Gateway creation custom resource'
    });

    createGatewayRole.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['bedrock-agentcore:CreateGateway', 'bedrock-agentcore:DeleteGateway'],
      resources: ['*'],
      conditions: {}
    }));

    // Add CloudWatch logs permissions for the Lambda custom resource
    const region = Stack.of(this).region;
    const account = Stack.of(this).account;
    createGatewayRole.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ],
      resources: [`arn:aws:logs:${region}:${account}:log-group:/aws/lambda/*`]
    }));

    const create = new AwsCustomResource(this, 'CreateGateway', {
      onCreate: {
        service: 'bedrock-agentcore-control',
        action: 'createGateway',
        parameters: {
          name: `${Stack.of(this).stackName}-gw`,
          protocolType: 'MCP'
        },
        physicalResourceId: PhysicalResourceId.fromResponse('gatewayId')
      },
      onDelete: {
        service: 'bedrock-agentcore-control',
        action: 'deleteGateway',
        parameters: { gatewayIdentifier: new PhysicalResourceIdReference() }
      },
      role: createGatewayRole,
      timeout: Duration.minutes(5)
    });

    this.gatewayId = create.getResponseField('gatewayId');

    const targets = new GatewayTargets(this, 'Targets', {
      gatewayId: this.gatewayId,
      routerFn: props.routerFn,
      invokeRole,
      tools: props.toolDefinitions
    });
    targets.node.addDependency(create);
  }
}
