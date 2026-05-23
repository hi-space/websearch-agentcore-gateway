import { NextResponse, type NextRequest } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { updateProvider } from '../../../../src/handlers/update-provider.js';

const ddb = new DynamoDBClient({});

export async function PUT(req: NextRequest, ctx: { params: { id: string } }) {
  const role = req.headers.get('x-auth-role');
  if (role !== 'admin' && role !== 'editor') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const actor = req.headers.get('x-auth-sub') ?? 'unknown';
  try {
    const body = await req.json();
    const out = await updateProvider(ddb, process.env.CONFIG_TABLE!, process.env.AUDIT_TABLE!, actor, ctx.params.id, body);
    return NextResponse.json(out);
  } catch (e) {
    if ((e as Error).message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }
    return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
  }
}
