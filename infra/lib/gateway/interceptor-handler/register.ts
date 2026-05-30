import {
  BedrockAgentCoreControlClient,
  GetGatewayCommand,
  UpdateGatewayCommand
} from '@aws-sdk/client-bedrock-agentcore-control';

/**
 * Adds (Create/Update) or removes (Delete) a single interceptor entry on a
 * Gateway. Idempotent: registering the same interceptor twice is a no-op.
 *
 * UpdateGateway requires the full request body, so we GetGateway first and
 * pass non-mutated fields through verbatim.
 */
export const handler = async (event: {
  RequestType: 'Create' | 'Update' | 'Delete';
  ResourceProperties: { gatewayId: string; interceptorArn: string };
  PhysicalResourceId?: string;
}): Promise<{ PhysicalResourceId: string }> => {
  const { gatewayId, interceptorArn } = event.ResourceProperties;
  const physicalResourceId = `${gatewayId}-interceptor`;
  const client = new BedrockAgentCoreControlClient({});

  const current = await client.send(new GetGatewayCommand({ gatewayIdentifier: gatewayId }));
  const cfg = current.authorizerConfiguration?.customJWTAuthorizer;
  if (!cfg) throw new Error(`Gateway ${gatewayId} has no customJWTAuthorizer`);

  const existing = (current as unknown as { interceptorConfigurations?: Array<{ interceptor?: { lambda?: { arn?: string } } }> })
    .interceptorConfigurations;
  const existingArns = new Set(
    (existing ?? []).map((c) => c.interceptor?.lambda?.arn).filter((x): x is string => !!x)
  );

  let desired: Array<unknown>;
  if (event.RequestType === 'Delete') {
    desired = (existing ?? []).filter((c) => c.interceptor?.lambda?.arn !== interceptorArn);
    if (desired.length === existing?.length) return { PhysicalResourceId: physicalResourceId };
  } else {
    if (existingArns.has(interceptorArn)) return { PhysicalResourceId: physicalResourceId };
    desired = [
      ...(existing ?? []),
      {
        interceptor: { lambda: { arn: interceptorArn } },
        interceptionPoints: ['REQUEST'],
        inputConfiguration: { passRequestHeaders: true }
      }
    ];
  }

  // The SDK input type for UpdateGateway lags behind the public API on the
  // interceptor field; we build the request as a plain object and cast at the
  // boundary. Field shapes (interceptor/interceptionPoints/inputConfiguration)
  // are validated by AgentCore at call time.
  const updateInput = {
    gatewayIdentifier: gatewayId,
    name: current.name,
    description: current.description,
    roleArn: current.roleArn,
    protocolType: current.protocolType,
    protocolConfiguration: current.protocolConfiguration,
    authorizerType: current.authorizerType,
    authorizerConfiguration: {
      customJWTAuthorizer: {
        discoveryUrl: cfg.discoveryUrl,
        allowedClients: cfg.allowedClients ?? []
      }
    },
    exceptionLevel: current.exceptionLevel,
    interceptorConfigurations: desired
  };
  await client.send(new UpdateGatewayCommand(updateInput as ConstructorParameters<typeof UpdateGatewayCommand>[0]));

  return { PhysicalResourceId: physicalResourceId };
};
