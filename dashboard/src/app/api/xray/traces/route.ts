import { NextRequest, NextResponse } from 'next/server';
import { GetTraceSummariesCommand } from '@aws-sdk/client-xray';
import {
  getXRayClient,
  gatewayFilterExpression,
  clampTraceRange,
  normalizeSummary,
} from '@/lib/xray';
import { TRACE_TIME_RANGES } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const range = clampTraceRange(request.nextUrl.searchParams.get('timeRange'));
    const minutes = TRACE_TIME_RANGES[range].minutes;
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - minutes * 60_000);

    const resp = await getXRayClient().send(
      new GetTraceSummariesCommand({
        StartTime: startTime,
        EndTime: endTime,
        // 'Event' (not 'TraceId') is required for Transaction Search, which is
        // backed by CloudWatch Logs and indexes traces by event time. 'TraceId'
        // mode returns nothing against this backend.
        TimeRangeType: 'Event',
        FilterExpression: gatewayFilterExpression(),
      })
    );

    const traces = (resp.TraceSummaries ?? []).map(normalizeSummary);
    traces.sort((a, b) => b.startTime - a.startTime);

    return NextResponse.json({
      traces,
      count: traces.length,
      status: traces.length ? 'Complete' : 'NoData',
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (
      name === 'InvalidRequestException' ||
      name === 'AccessDeniedException' ||
      name === 'ThrottledException'
    ) {
      return NextResponse.json({
        traces: [],
        count: 0,
        status: 'Unavailable',
        note: `X-Ray traces unavailable: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
    console.error('Failed to query X-Ray trace summaries:', error);
    return NextResponse.json(
      { error: 'Failed to query traces', details: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
