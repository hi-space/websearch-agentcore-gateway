import { NextResponse } from 'next/server';
import { getGatewayOverview } from '@/lib/server/agentcore';

export const dynamic = 'force-dynamic';

/**
 * Access control for this AgentCore gateway is the JWT authorizer context:
 * who can call the gateway (the allowed-clients list) plus the live target
 * roster. There is no IAM-style or Cedar policy document for AgentCore
 * gateways, so this endpoint just surfaces the gateway overview.
 */
export async function GET() {
  try {
    const overview = await getGatewayOverview();
    return NextResponse.json({ overview });
  } catch (error) {
    console.error('Failed to load access state:', error);
    return NextResponse.json(
      { error: 'Failed to load access state', details: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
