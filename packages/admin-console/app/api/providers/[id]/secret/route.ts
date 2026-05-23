import { NextResponse, type NextRequest } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { z } from 'zod';
import { putSecret } from '../../../../../src/handlers/put-secret.js';

const ddb = new DynamoDBClient({});
const sm = new SecretsManagerClient({});
const Body = z.object({ value: z.string().min(8) });

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  if (req.headers.get('x-auth-role') !== 'admin') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const actor = req.headers.get('x-auth-sub') ?? 'unknown';
  try {
    const { value } = Body.parse(await req.json());
    const out = await putSecret(ddb, sm, process.env.CONFIG_TABLE!, process.env.AUDIT_TABLE!, actor, ctx.params.id, value);
    return NextResponse.json(out);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'NOT_FOUND') return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
  }
}
