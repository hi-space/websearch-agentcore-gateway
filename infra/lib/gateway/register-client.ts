import { Construct } from 'constructs';
import { CustomResource, Duration, Stack } from 'aws-cdk-lib';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime, Architecture } from 'aws-cdk-lib/aws-lambda';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface GatewayClientRegistrationProps {
  /** Gateway whose allowedClients list will be mutated. */
  gatewayId: string;
  /** Cognito app client id to add (Create) / remove (Delete). */
  clientId: string;
  /**
   * IAM role ARN of the Gateway. UpdateGateway needs to PassRole this back to
   * the service, so the registration handler must be allowed to PassRole it.
   */
  gatewayRoleArn: string;
}

/**
 * Side-stack registration of an extra Cognito client into an already-created
 * AgentCore Gateway. Used to admit the admin Hosted-UI OAuth client into a
 * Gateway that lives in a sibling stack — the admin client id isn't known
 * until AdminConsoleStack synthesizes, so it can't be in the original
 * CreateGateway call without introducing a Search↔Admin cycle.
 */
export class GatewayClientRegistration extends Construct {
  constructor(scope: Construct, id: string, props: GatewayClientRegistrationProps) {
    super(scope, id);

    const onEvent = new NodejsFunction(this, 'OnEvent', {
      entry: path.join(__dirname, 'register-client-handlers/on-event.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_20_X,
      architecture: Architecture.ARM_64,
      timeout: Duration.minutes(1),
      bundling: {
        format: OutputFormat.CJS,
        target: 'node20',
        minify: true,
        externalModules: ['@aws-sdk/client-s3', '@aws-sdk/client-dynamodb']
      }
    });
    onEvent.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['bedrock-agentcore:GetGateway', 'bedrock-agentcore:UpdateGateway'],
        resources: [
          `arn:${Stack.of(this).partition}:bedrock-agentcore:${Stack.of(this).region}:${Stack.of(this).account}:gateway/${props.gatewayId}`
        ]
      })
    );
    onEvent.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['iam:PassRole'],
        resources: [props.gatewayRoleArn]
      })
    );

    const provider = new Provider(this, 'Provider', { onEventHandler: onEvent });

    new CustomResource(this, 'Resource', {
      serviceToken: provider.serviceToken,
      properties: { gatewayId: props.gatewayId, clientId: props.clientId }
    });
  }
}
