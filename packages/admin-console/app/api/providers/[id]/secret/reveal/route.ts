export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { z } from 'zod';
import { revealSecret } from '../../../../../../src/handlers/reveal-secret';

const ddb = new DynamoDBClient({});
const sm = new SecretsManagerClient({});

const Body = z.object({
  reason: z.string().min(4).max(500)
});

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  if (req.headers.get('x-auth-role') !== 'admin') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const actor = req.headers.get('x-auth-sub');
  if (!actor) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
  }

  try {
    const out = await revealSecret({
      ddb, sm,
      configTable: process.env.CONFIG_TABLE!,
      auditTable: process.env.AUDIT_TABLE!,
      actor,
      providerId: ctx.params.id,
      reason: body.reason
    });
    const res = NextResponse.json(out);
    res.headers.set('cache-control', 'no-store, no-cache, must-revalidate');
    res.headers.set('pragma', 'no-cache');
    return res;
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'NOT_FOUND' || msg === 'NO_SECRET') {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg === 'INVALID_INPUT') {
      return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
    }
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
