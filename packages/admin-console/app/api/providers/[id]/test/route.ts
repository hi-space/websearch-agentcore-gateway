export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { LambdaClient } from '@aws-sdk/client-lambda';
import { testProvider } from '../../../../../src/handlers/test-provider';

const lambda = new LambdaClient({});

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const role = req.headers.get('x-auth-role');
  if (role !== 'admin' && role !== 'editor') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const out = await testProvider(lambda, process.env.SEARCH_ROUTER_ARN!, ctx.params.id);
  return NextResponse.json(out, { status: out.ok ? 200 : 502 });
}
