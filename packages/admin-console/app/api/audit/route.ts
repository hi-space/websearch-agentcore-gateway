import { NextResponse, type NextRequest } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { listAudit } from '../../../src/handlers/list-audit.js';

const ddb = new DynamoDBClient({});

export async function GET(req: NextRequest) {
  if (req.headers.get('x-auth-role') === null) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const limit = Number(new URL(req.url).searchParams.get('limit') ?? '50');
  const rows = await listAudit(ddb, process.env.AUDIT_TABLE!, limit);
  return NextResponse.json({ rows });
}
