import { Construct } from 'constructs';
import { CustomResource, Duration, Stack } from 'aws-cdk-lib';
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
  PhysicalResourceIdReference
} from 'aws-cdk-lib/custom-resources';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';

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
      policy: AwsCustomResourcePolicy.fromStatements([
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['bedrock-agentcore:CreateGateway', 'bedrock-agentcore:DeleteGateway'],
          resources: ['*']
        })
      ]),
      timeout: Duration.minutes(5)
    });

    this.gatewayId = create.getResponseField('gatewayId');

    new AwsCustomResource(this, 'CreateTarget', {
      onCreate: {
        service: 'bedrock-agentcore-control',
        action: 'createTarget',
        parameters: {
          gatewayIdentifier: this.gatewayId,
          name: 'search-router',
          targetConfiguration: {
            mcp: {
              lambda: {
                lambdaArn: props.routerFn.functionArn,
                toolSchema: { tools: props.toolDefinitions }
              }
            }
          },
          credentialProviderConfigurations: [{
            credentialProviderType: 'GATEWAY_IAM_ROLE',
            credentialProvider: { gatewayIamRole: { roleArn: invokeRole.roleArn } }
          }]
        },
        physicalResourceId: PhysicalResourceId.fromResponse('targetId')
      },
      policy: AwsCustomResourcePolicy.fromStatements([
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['bedrock-agentcore:CreateTarget', 'bedrock-agentcore:DeleteTarget'],
          resources: ['*']
        }),
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['iam:PassRole'],
          resources: [invokeRole.roleArn]
        })
      ]),
      timeout: Duration.minutes(5)
    }).node.addDependency(create);
  }
}
