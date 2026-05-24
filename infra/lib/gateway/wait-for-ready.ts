import { Construct } from 'constructs';
import { Duration, CustomResource } from 'aws-cdk-lib';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime, Architecture } from 'aws-cdk-lib/aws-lambda';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface GatewayWaitForReadyProps {
  gatewayId: string;
}

export class GatewayWaitForReady extends Construct {
  constructor(scope: Construct, id: string, props: GatewayWaitForReadyProps) {
    super(scope, id);

    const onEvent = new NodejsFunction(this, 'OnEvent', {
      entry: path.join(__dirname, 'wait-for-ready-handlers/on-event.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_20_X,
      architecture: Architecture.ARM_64,
      timeout: Duration.minutes(1),
      bundling: { format: OutputFormat.ESM, target: 'node20', minify: true }
    });

    const isComplete = new NodejsFunction(this, 'IsComplete', {
      entry: path.join(__dirname, 'wait-for-ready-handlers/is-complete.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_20_X,
      architecture: Architecture.ARM_64,
      timeout: Duration.minutes(1),
      bundling: {
        format: OutputFormat.ESM,
        target: 'node20',
        minify: true,
        // Bundle the bedrock-agentcore-control client (NOT in Lambda's bundled SDK)
        externalModules: ['@aws-sdk/client-s3', '@aws-sdk/client-dynamodb']
      }
    });
    isComplete.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['bedrock-agentcore:GetGateway'],
      resources: ['*']
    }));

    const provider = new Provider(this, 'Provider', {
      onEventHandler: onEvent,
      isCompleteHandler: isComplete,
      queryInterval: Duration.seconds(10),
      totalTimeout: Duration.minutes(10)
    });

    new CustomResource(this, 'Resource', {
      serviceToken: provider.serviceToken,
      properties: { gatewayId: props.gatewayId }
    });
  }
}
