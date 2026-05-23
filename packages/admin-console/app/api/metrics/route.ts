import { NextResponse } from 'next/server';
import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';
import { getMetrics } from '../../../src/handlers/get-metrics.js';

const cw = new CloudWatchClient({});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ids = url.searchParams.get('providers')?.split(',').filter(Boolean) ?? [];
  const out = await getMetrics(cw, ids);
  return NextResponse.json({ metrics: out });
}
