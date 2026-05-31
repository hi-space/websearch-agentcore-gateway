import { NextRequest, NextResponse } from 'next/server';
import {
  CloudWatchLogsClient,
  StartQueryCommand,
  GetQueryResultsCommand,
  ResourceNotFoundException,
} from '@aws-sdk/client-cloudwatch-logs';
import { AWS_REGION, GATEWAY_ID, TIME_RANGES, type TimeRangeKey } from '@/lib/constants';
import { groupIntoToolCalls } from '@/lib/server/audit-logs';

export const dynamic = 'force-dynamic';

const client = new CloudWatchLogsClient({ region: AWS_REGION });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function GET(request: NextRequest) {
  try {
    const timeRange = (request.nextUrl.searchParams.get('timeRange') || '24h') as TimeRangeKey;
    const tool = request.nextUrl.searchParams.get('tool')?.trim();
    const errorFilter = request.nextUrl.searchParams.get('error')?.trim();

    const minutes = (TIME_RANGES[timeRange] ?? TIME_RANGES['24h']).minutes;
    const startTime = Math.floor((Date.now() - minutes * 60_000) / 1000);
    const endTime = Math.floor(Date.now() / 1000);

    const logGroupName = `/aws/vendedlogs/bedrock-agentcore/gateway/APPLICATION_LOGS/${GATEWAY_ID}`;

    // We group lines into tool calls in JS, so the Insights query stays broad —
    // fetch raw lines and filter after grouping. limit is high because one tool
    // call spans ~4-5 lines.
    const queryString = 'fields @timestamp, @message | sort @timestamp desc | limit 1000';

    let queryId: string | undefined;
    try {
      const startResult = await client.send(
        new StartQueryCommand({ logGroupName, startTime, endTime, queryString })
      );
      queryId = startResult.queryId;
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        // Log group not created yet (no vended logs delivered). Return an empty,
        // explanatory result rather than a 500.
        return NextResponse.json({
          toolCalls: [],
          status: 'NoLogGroup',
          note: `Log group not found: ${logGroupName}. Vended logs may not be enabled yet.`,
        });
      }
      throw error;
    }

    if (!queryId) throw new Error('No query ID returned from StartQuery');

    // Poll with backoff up to ~10s.
    let status = 'Running';
    let results: Array<Array<{ field?: string; value?: string }>> = [];
    for (let attempt = 0; attempt < 20; attempt++) {
      await sleep(attempt < 5 ? 250 : 750);
      const resp = await client.send(new GetQueryResultsCommand({ queryId }));
      status = resp.status || 'Unknown';
      results = (resp.results as typeof results) ?? [];
      if (status === 'Complete' || status === 'Failed' || status === 'Cancelled') break;
    }

    // Normalize Insights rows into {message,timestamp} lines, then group by trace.
    const lines = results.map((row) => {
      let message = '';
      let timestamp = '';
      for (const cell of row) {
        if (cell.field === '@message') message = cell.value ?? '';
        if (cell.field === '@timestamp') timestamp = cell.value ?? '';
      }
      return { message, timestamp };
    });

    let toolCalls = groupIntoToolCalls(lines);

    // Apply UI filters on the derived fields.
    if (tool) {
      const needle = tool.toLowerCase();
      toolCalls = toolCalls.filter(
        (c) => c.tool?.toLowerCase().includes(needle) || c.toolFull?.toLowerCase().includes(needle)
      );
    }
    if (errorFilter) {
      toolCalls = toolCalls.filter((c) => c.status !== 'success');
    }

    return NextResponse.json({ toolCalls, status, count: toolCalls.length });
  } catch (error) {
    console.error('Failed to query logs:', error);
    return NextResponse.json(
      { error: 'Failed to query logs', details: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
