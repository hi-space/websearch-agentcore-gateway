export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { LambdaClient } from '@aws-sdk/client-lambda';
import { updateProvider, VerificationFailedError } from '../../../../src/handlers/update-provider';

const ddb = new DynamoDBClient({});
const lambda = new LambdaClient({});

export async function PUT(req: NextRequest, ctx: { params: { id: string } }) {
  const role = req.headers.get('x-auth-role');
  if (role !== 'admin' && role !== 'editor') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const actor = req.headers.get('x-auth-sub') ?? 'unknown';
  try {
    const body = await req.json();
    const out = await updateProvider(
      ddb,
      lambda,
      process.env.SEARCH_ROUTER_ARN!,
      process.env.CONFIG_TABLE!,
      process.env.AUDIT_TABLE!,
      actor,
      ctx.params.id,
      body
    );
    return NextResponse.json(out);
  } catch (e) {
    if (e instanceof VerificationFailedError) {
      return NextResponse.json({ error: 'VERIFICATION_FAILED', lastVerify: e.lastVerify }, { status: 400 });
    }
    if ((e as Error).message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }
    return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
  }
}
