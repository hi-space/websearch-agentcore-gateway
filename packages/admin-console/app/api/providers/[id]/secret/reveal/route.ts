export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { KMSClient } from '@aws-sdk/client-kms';
import { z } from 'zod';
import { revealSecret } from '../../../../../../src/handlers/reveal-secret';

const ddb = new DynamoDBClient({});
const sm = new SecretsManagerClient({});
const kms = new KMSClient({});

const Body = z.object({
  reason: z.string().min(4).max(500),
  mfa_assertion: z.object({
    payload: z.string().min(1),
    signature: z.string().min(1)
  })
});

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  if (req.headers.get('x-auth-role') !== 'admin') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const actor = req.headers.get('x-auth-sub');
  if (!actor) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  if (!process.env.MFA_KMS_KEY_ID || !process.env.MFA_REPLAY_TABLE) {
    return NextResponse.json({ error: 'MFA_NOT_CONFIGURED' }, { status: 503 });
  }

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
  }

  try {
    const out = await revealSecret({
      ddb, sm, kms,
      configTable: process.env.CONFIG_TABLE!,
      auditTable: process.env.AUDIT_TABLE!,
      replayTable: process.env.MFA_REPLAY_TABLE,
      mfaKeyId: process.env.MFA_KMS_KEY_ID,
      actor,
      providerId: ctx.params.id,
      reason: body.reason,
      assertion: body.mfa_assertion
    });
    const res = NextResponse.json(out);
    res.headers.set('cache-control', 'no-store, no-cache, must-revalidate');
    res.headers.set('pragma', 'no-cache');
    return res;
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'STEP_UP_REQUIRED') {
      return NextResponse.json({ error: 'step_up_required' }, { status: 401 });
    }
    if (msg === 'RATE_LIMITED') {
      return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
    }
    if (msg === 'NOT_FOUND' || msg === 'NO_SECRET') {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg === 'INVALID_INPUT') {
      return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
    }
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
