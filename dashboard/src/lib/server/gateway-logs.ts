import {
  CloudWatchLogsClient,
  StartQueryCommand,
  GetQueryResultsCommand,
  ResourceNotFoundException,
} from '@aws-sdk/client-cloudwatch-logs';
import { AWS_REGION, GATEWAY_ID } from '@/lib/constants';

/**
 * Fetches the AgentCore Gateway vended logs for a single trace and shapes them
 * into the request/response/error timeline the traces detail view renders.
 *
 * The X-Ray waterfall shows *timing* but the spans never carry an error
 * message — only `error_type` / `jsonrpc.error.code`. The real "why did it
 * fail" (the jsonrpc error text, a tool's own error payload, a bad-auth note)
 * lives in the gateway's vended logs, keyed by the same `trace_id`. Joining the
 * two is what turns the waterfall into a debugging tool.
 */

const client = new CloudWatchLogsClient({ region: AWS_REGION });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface GatewayLogEntry {
  timestamp: string; // ISO
  spanId: string | null;
  isError: boolean;
  // A short human label for the event ("Started processing request", ...).
  log: string | null;
  // Parsed request/response payloads when present (kept as strings — the
  // gateway logs them as Java-map-ish text, not strict JSON).
  requestBody: string | null;
  responseBody: string | null;
  // The extracted error message, if this entry represents a failure.
  errorMessage: string | null;
}

// The gateway logs `requestBody`/`responseBody` as a Java-style map dump
// (e.g. `{id=5, jsonrpc=2.0, ...}`), not JSON. We surface them verbatim but
// try to pull a jsonrpc error message out for the dedicated error field.
function extractErrorMessage(body: Record<string, unknown>): string | null {
  const resp = typeof body.responseBody === 'string' ? body.responseBody : '';
  // jsonrpc error shape: `error={code=-32602, message=...}`
  const m = /message=([^}]+?)(?:,\s*data=|})/.exec(resp);
  if (m && resp.includes('error={')) return m[1].trim();
  // A tool that returned results but with an embedded "error":"..." field.
  const toolErr = /"error":"((?:[^"\\]|\\.)*)"/.exec(resp);
  if (toolErr && toolErr[1] && toolErr[1] !== 'null') return toolErr[1];
  // An isError log line (e.g. outbound api-key failure) carries it in `log`.
  if (body.isError && typeof body.log === 'string') return body.log;
  return null;
}

function parseLogRow(message: string, timestamp: string): GatewayLogEntry | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(message);
  } catch {
    return null;
  }
  const body = (parsed.body ?? {}) as Record<string, unknown>;
  return {
    timestamp,
    spanId: typeof parsed.span_id === 'string' ? parsed.span_id : null,
    isError: Boolean(body.isError),
    log: typeof body.log === 'string' ? body.log : null,
    requestBody: typeof body.requestBody === 'string' ? body.requestBody : null,
    responseBody: typeof body.responseBody === 'string' ? body.responseBody : null,
    errorMessage: extractErrorMessage(body),
  };
}

export async function fetchLogsForTrace(
  logTraceId: string,
  lookbackMinutes = 1440
): Promise<GatewayLogEntry[]> {
  const logGroupName = `/aws/vendedlogs/bedrock-agentcore/gateway/APPLICATION_LOGS/${GATEWAY_ID}`;
  const startTime = Math.floor((Date.now() - lookbackMinutes * 60_000) / 1000);
  const endTime = Math.floor(Date.now() / 1000);

  // trace_id is a plain field in the JSON message; filter on it directly.
  const queryString =
    `fields @timestamp, @message ` +
    `| filter trace_id = "${logTraceId}" ` +
    `| sort @timestamp asc | limit 100`;

  let queryId: string | undefined;
  try {
    const start = await client.send(
      new StartQueryCommand({ logGroupName, startTime, endTime, queryString })
    );
    queryId = start.queryId;
  } catch (error) {
    if (error instanceof ResourceNotFoundException) return [];
    throw error;
  }
  if (!queryId) return [];

  let results: Array<Array<{ field?: string; value?: string }>> = [];
  for (let attempt = 0; attempt < 20; attempt++) {
    await sleep(attempt < 5 ? 250 : 750);
    const resp = await client.send(new GetQueryResultsCommand({ queryId }));
    results = (resp.results as typeof results) ?? [];
    const status = resp.status || 'Unknown';
    if (status === 'Complete' || status === 'Failed' || status === 'Cancelled') break;
  }

  const entries: GatewayLogEntry[] = [];
  for (const row of results) {
    let timestamp = '';
    let message = '';
    for (const cell of row) {
      if (cell.field === '@timestamp') timestamp = cell.value ?? '';
      if (cell.field === '@message') message = cell.value ?? '';
    }
    const entry = parseLogRow(message, timestamp);
    if (entry) entries.push(entry);
  }
  return entries;
}
