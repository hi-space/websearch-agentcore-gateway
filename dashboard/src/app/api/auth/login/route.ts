import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getGatewayToken } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

/**
 * Issues a real Cognito M2M (client_credentials) access token for the gateway.
 *
 * This is the machine-to-machine flow the dashboard and Cowork clients use.
 * The token is minted server-side using the M2M client secret, which never
 * reaches the browser.
 */

const LoginRequestSchema = z.object({
  // Reserved for a future ROPC flow; M2M is the only supported flow today.
  auth_flow: z.enum(['CLIENT_CREDENTIALS']).optional().default('CLIENT_CREDENTIALS'),
});

export async function POST(request: NextRequest) {
  try {
    // Body is optional; default to the M2M flow.
    const raw = await request.json().catch(() => ({}));
    LoginRequestSchema.parse(raw);

    const accessToken = await getGatewayToken();

    return NextResponse.json({
      access_token: accessToken,
      token_type: 'Bearer',
    });
  } catch (error) {
    console.error('Login failed:', error);
    return NextResponse.json(
      { error: 'Login failed', details: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
