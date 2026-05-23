export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { revealSecret } from '../../../../../../src/handlers/reveal-secret';

const ddb = new DynamoDBClient({});
const sm = new SecretsManagerClient({});

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  if (req.headers.get('x-auth-role') !== 'admin') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const actor = req.headers.get('x-auth-sub') ?? 'unknown';
  try {
    const out = await revealSecret(ddb, sm, process.env.CONFIG_TABLE!, process.env.AUDIT_TABLE!, actor, ctx.params.id);
    return NextResponse.json(out);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'NOT_FOUND' || msg === 'NO_SECRET') return NextResponse.json({ error: msg }, { status: 404 });
    throw e;
  }
}
