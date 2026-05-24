import { BedrockAgentCoreControlClient, GetGatewayCommand } from '@aws-sdk/client-bedrock-agentcore-control';

const client = new BedrockAgentCoreControlClient({});

interface IsCompleteInput {
  RequestType: 'Create' | 'Update' | 'Delete';
  ResourceProperties: { gatewayId: string };
}

export const handler = async (event: IsCompleteInput) => {
  if (event.RequestType === 'Delete') return { IsComplete: true };
  const gatewayId = event.ResourceProperties.gatewayId;
  const out = await client.send(new GetGatewayCommand({ gatewayIdentifier: gatewayId }));
  if (out.status === 'READY') return { IsComplete: true, Data: { gatewayId } };
  if (out.status === 'FAILED') {
    throw new Error(`Gateway entered FAILED state: ${JSON.stringify(out.statusReasons ?? [])}`);
  }
  return { IsComplete: false };
};
