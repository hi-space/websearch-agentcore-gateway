import { NextRequest, NextResponse } from 'next/server';
import { BatchGetTracesCommand } from '@aws-sdk/client-xray';
import { getXRayClient, buildSpanList, xrayIdToLogTraceId } from '@/lib/xray';
import { fetchLogsForTrace } from '@/lib/server/gateway-logs';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<'/api/xray/traces/[id]'>
) {
  const { id } = await ctx.params;
  try {
    const resp = await getXRayClient().send(
      new BatchGetTracesCommand({ TraceIds: [id] })
    );
    const trace = resp.Traces?.[0];
    if (!trace) {
      return NextResponse.json({ traceId: id, spans: [], logs: [], status: 'NotFound' });
    }
    const spans = buildSpanList(trace.Segments);
    spans.sort((a, b) => a.startTime - b.startTime);

    // Join the gateway vended logs for this trace so the detail view can show
    // request/response bodies + the real error message (X-Ray spans only carry
    // error_type/codes, never the message). The log `trace_id` is the X-Ray id
    // with the version prefix and dashes stripped.
    const logTraceId = xrayIdToLogTraceId(id);
    const logs = logTraceId
      ? await fetchLogsForTrace(logTraceId).catch(() => [])
      : [];

    return NextResponse.json({ traceId: id, spans, logs, status: 'Complete' });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (
      name === 'InvalidRequestException' ||
      name === 'AccessDeniedException' ||
      name === 'ThrottledException'
    ) {
      return NextResponse.json({
        traceId: id,
        spans: [],
        logs: [],
        status: 'Unavailable',
        note: error instanceof Error ? error.message : String(error),
      });
    }
    console.error('Failed to fetch X-Ray trace:', error);
    return NextResponse.json(
      { error: 'Failed to fetch trace', details: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
