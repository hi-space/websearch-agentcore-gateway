import { Construct } from 'constructs';
import { CustomResource, Duration, Stack } from 'aws-cdk-lib';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime, Architecture, IFunction } from 'aws-cdk-lib/aws-lambda';
import { Effect, PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface GatewayInterceptorProps {
  gatewayId: string;
  gatewayRoleArn: string;
}

/**
 * The interceptor Lambda + the post-deploy CustomResource that registers it
 * with the Gateway.
 *
 * Why post-deploy: at the time CreateGateway runs we may not yet have the
 * interceptor function ARN available as a string (CFN ordering); and the CDK
 * AgentCore L1 surface does not yet expose interceptorConfigurations on
 * CreateGateway (per AWS sample-agentcore-multi-tenant scripts/
 * configure-gateway-interceptor.py). UpdateGateway requires the full payload,
 * which is why this construct fetches via GetGateway, merges, and pushes back.
 */
export class GatewayInterceptor extends Construct {
  readonly fn: IFunction;

  constructor(scope: Construct, id: string, props: GatewayInterceptorProps) {
    super(scope, id);

    const interceptor = new NodejsFunction(this, 'Fn', {
      entry: path.join(__dirname, 'interceptor-handler/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_20_X,
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(5),
      memorySize: 256,
      bundling: { format: OutputFormat.ESM, target: 'node20', minify: true }
    });
    // Allow Gateway service to invoke the interceptor synchronously.
    interceptor.addPermission('GatewayInvoke', {
      principal: new ServicePrincipal('bedrock-agentcore.amazonaws.com'),
      action: 'lambda:InvokeFunction',
      sourceArn: `arn:${Stack.of(this).partition}:bedrock-agentcore:${Stack.of(this).region}:${Stack.of(this).account}:gateway/${props.gatewayId}`
    });
    this.fn = interceptor;

    const onEvent = new NodejsFunction(this, 'Register', {
      entry: path.join(__dirname, 'interceptor-handler/register.ts'),
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
      properties: {
        gatewayId: props.gatewayId,
        interceptorArn: interceptor.functionArn
      }
    });
  }
}
