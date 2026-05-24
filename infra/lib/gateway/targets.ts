import { Construct } from 'constructs';
import { Duration } from 'aws-cdk-lib';
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
  PhysicalResourceIdReference
} from 'aws-cdk-lib/custom-resources';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import { Effect, PolicyStatement, Role } from 'aws-cdk-lib/aws-iam';

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: unknown;
}

export interface GatewayTargetsProps {
  gatewayId: string;
  routerFn: IFunction;
  invokeRole: Role;
  tools: ToolDef[];
}

export class GatewayTargets extends Construct {
  constructor(scope: Construct, id: string, props: GatewayTargetsProps) {
    super(scope, id);

    props.tools.forEach((tool) => {
      const safeName = tool.name.replace(/_/g, '-');
      new AwsCustomResource(this, `CreateTarget-${tool.name}`, {
        onCreate: {
          service: 'bedrock-agentcore-control',
          action: 'createGatewayTarget',
          parameters: {
            gatewayIdentifier: props.gatewayId,
            name: `search-router-${safeName}`,
            targetConfiguration: {
              mcp: {
                lambda: {
                  lambdaArn: props.routerFn.functionArn,
                  toolSchema: { inlinePayload: [tool] }
                }
              }
            },
            credentialProviderConfigurations: [{ credentialProviderType: 'GATEWAY_IAM_ROLE' }]
          },
          physicalResourceId: PhysicalResourceId.fromResponse('targetId')
        },
        onDelete: {
          service: 'bedrock-agentcore-control',
          action: 'deleteGatewayTarget',
          parameters: {
            gatewayIdentifier: props.gatewayId,
            targetId: new PhysicalResourceIdReference()
          },
          ignoreErrorCodesMatching: 'ValidationException|ResourceNotFoundException'
        },
        policy: AwsCustomResourcePolicy.fromStatements([
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ['bedrock-agentcore:CreateGatewayTarget', 'bedrock-agentcore:DeleteGatewayTarget'],
            resources: ['*']
          }),
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ['iam:PassRole'],
            resources: [props.invokeRole.roleArn]
          })
        ]),
        installLatestAwsSdk: true,
        timeout: Duration.minutes(5)
      });
    });
  }
}
