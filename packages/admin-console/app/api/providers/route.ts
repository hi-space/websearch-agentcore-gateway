export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { listProviders } from '../../../src/handlers/list-providers';

const ddb = new DynamoDBClient({});

export async function GET() {
  const rows = await listProviders(ddb, process.env.CONFIG_TABLE!);
  return NextResponse.json({ providers: rows });
}
