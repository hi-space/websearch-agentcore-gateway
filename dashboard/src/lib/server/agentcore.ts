import {
  BedrockAgentCoreControlClient,
  GetGatewayCommand,
  ListGatewayTargetsCommand,
} from '@aws-sdk/client-bedrock-agentcore-control';
import { AWS_REGION, GATEWAY_ID } from '@/lib/constants';

/**
 * Server-side helper around the AgentCore control plane.
 *
 * NOTE: Import only from route handlers. Uses the Lambda/host AWS credentials.
 */

const client = new BedrockAgentCoreControlClient({ region: AWS_REGION });

export interface GatewaySummary {
  gatewayId: string;
  gatewayArn?: string;
  name?: string;
  status?: string;
  protocolType?: string;
  authorizerType?: string;
  allowedClients: string[];
  targets: Array<{ name: string; status: string; targetId: string }>;
}

export async function getGatewayOverview(): Promise<GatewaySummary> {
  const [gateway, targetsResp] = await Promise.all([
    client.send(new GetGatewayCommand({ gatewayIdentifier: GATEWAY_ID })),
    client.send(new ListGatewayTargetsCommand({ gatewayIdentifier: GATEWAY_ID })),
  ]);

  const allowedClients =
    gateway.authorizerConfiguration?.customJWTAuthorizer?.allowedClients ?? [];

  const targets = (targetsResp.items ?? []).map((t) => ({
    name: t.name ?? '(unnamed)',
    status: String(t.status ?? 'UNKNOWN'),
    targetId: t.targetId ?? '',
  }));

  return {
    gatewayId: gateway.gatewayId ?? GATEWAY_ID,
    gatewayArn: gateway.gatewayArn,
    name: gateway.name,
    status: gateway.status,
    protocolType: gateway.protocolType,
    authorizerType: gateway.authorizerType,
    allowedClients,
    targets,
  };
}
