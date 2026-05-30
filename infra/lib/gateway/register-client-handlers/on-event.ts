import {
  BedrockAgentCoreControlClient,
  GetGatewayCommand,
  UpdateGatewayCommand
} from '@aws-sdk/client-bedrock-agentcore-control';

/**
 * Adds (Create/Update) or removes (Delete) the supplied Cognito client id
 * from a Gateway's customJWTAuthorizer.allowedClients. The handler is
 * idempotent — Create on an already-registered client is a no-op, Delete on
 * an already-removed client is a no-op.
 *
 * UpdateGateway requires the full request body even when only one field
 * changes, so we fetch via GetGateway, mutate the allowedClients list, and
 * pass the rest through unchanged.
 */
export const handler = async (event: {
  RequestType: 'Create' | 'Update' | 'Delete';
  ResourceProperties: { gatewayId: string; clientId: string };
  PhysicalResourceId?: string;
}): Promise<{ PhysicalResourceId: string }> => {
  const { gatewayId, clientId } = event.ResourceProperties;
  const physicalResourceId = `${gatewayId}-${clientId}`;
  const client = new BedrockAgentCoreControlClient({});

  const current = await client.send(new GetGatewayCommand({ gatewayIdentifier: gatewayId }));
  const cfg = current.authorizerConfiguration?.customJWTAuthorizer;
  if (!cfg) {
    throw new Error(`Gateway ${gatewayId} has no customJWTAuthorizer to mutate`);
  }
  const existing = cfg.allowedClients ?? [];
  const desired = event.RequestType === 'Delete'
    ? existing.filter((c) => c !== clientId)
    : Array.from(new Set([...existing, clientId]));

  if (sameSet(existing, desired)) {
    return { PhysicalResourceId: physicalResourceId };
  }

  await client.send(
    new UpdateGatewayCommand({
      gatewayIdentifier: gatewayId,
      name: current.name!,
      description: current.description,
      roleArn: current.roleArn!,
      protocolType: current.protocolType,
      protocolConfiguration: current.protocolConfiguration,
      authorizerType: current.authorizerType,
      authorizerConfiguration: {
        customJWTAuthorizer: {
          discoveryUrl: cfg.discoveryUrl!,
          allowedClients: desired
        }
      },
      exceptionLevel: current.exceptionLevel
    })
  );

  return { PhysicalResourceId: physicalResourceId };
};

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((x) => set.has(x));
}
