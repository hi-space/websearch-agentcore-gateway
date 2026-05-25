export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { LambdaClient } from '@aws-sdk/client-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { z } from 'zod';
import { playgroundSearch } from '../../../src/handlers/playground-search';

const lambda = new LambdaClient({});
const ddb = new DynamoDBClient({});

const Body = z.object({
  query: z.string().min(1).max(2048),
  topK: z.number().int().positive().max(50).optional()
});

export async function POST(req: NextRequest) {
  const role = req.headers.get('x-auth-role');
  if (role !== 'admin' && role !== 'editor') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const actor = req.headers.get('x-auth-sub') ?? undefined;

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
  }

  try {
    const out = await playgroundSearch(
      lambda,
      process.env.SEARCH_ROUTER_ARN!,
      body.query,
      body.topK,
      ddb,
      process.env.AUDIT_TABLE,
      actor
    );
    return NextResponse.json(out);
  } catch (e) {
    const code = (e as Error).message || 'INTERNAL';
    return NextResponse.json({ error: code }, { status: 502 });
  }
}
