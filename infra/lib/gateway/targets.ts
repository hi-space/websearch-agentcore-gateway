import { Construct } from 'constructs';
import { Duration } from 'aws-cdk-lib';
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId
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

    // Create one target per tool
    props.tools.forEach((tool, index) => {
      new AwsCustomResource(this, `CreateTarget-${tool.name}`, {
        onCreate: {
          service: 'bedrock-agentcore-control',
          action: 'createTarget',
          parameters: {
            gatewayIdentifier: props.gatewayId,
            name: `search-router-${tool.name}`,
            targetConfiguration: {
              mcp: {
                lambda: {
                  lambdaArn: props.routerFn.functionArn,
                  toolSchema: { tools: [tool] }
                }
              }
            },
            credentialProviderConfigurations: [{
              credentialProviderType: 'GATEWAY_IAM_ROLE',
              credentialProvider: { gatewayIamRole: { roleArn: props.invokeRole.roleArn } }
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
            resources: [props.invokeRole.roleArn]
          })
        ]),
        installLatestAwsSdk: false,
        timeout: Duration.minutes(5)
      });
    });
  }
}
