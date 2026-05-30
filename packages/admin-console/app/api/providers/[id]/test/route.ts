export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { LambdaClient } from '@aws-sdk/client-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { testProvider } from '../../../../../src/handlers/test-provider';

const lambda = new LambdaClient({});
const ddb = new DynamoDBClient({});

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const role = req.headers.get('x-auth-role');
  if (role !== 'admin' && role !== 'editor') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const actor = req.headers.get('x-auth-sub') ?? 'unknown';
  try {
    const out = await testProvider(
      lambda,
      process.env.SEARCH_ROUTER_ARN!,
      ctx.params.id,
      ddb,
      process.env.CONFIG_TABLE!,
      process.env.AUDIT_TABLE!,
      actor
    );
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message || 'INTERNAL' }, { status: 502 });
  }
}
