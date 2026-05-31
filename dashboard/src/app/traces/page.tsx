'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AppShell } from '@/components/shell';
import { Loader2, Activity, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import { TRACE_TIME_RANGES, type TraceTimeRangeKey } from '@/lib/constants';
import {
  parseJavaMap,
  extractToolName,
  extractArguments,
  extractToolError,
  extractLatencyMs,
  extractResponseText,
  prettyPrintBody,
} from '@/lib/server/audit-logs';

const TRACES_PER_PAGE = 10;

interface TraceListItem {
  id: string;
  startTime: number;
  duration: number;
  tool: string | null;
  httpStatus: number | null;
  httpMethod: string | null;
  hasFault: boolean;
  hasError: boolean;
  hasThrottle: boolean;
}

interface TraceListResponse {
  traces: TraceListItem[];
  count: number;
  status: 'Complete' | 'NoData' | 'Unavailable';
  note?: string;
}

interface Span {
  id: string;
  parentId: string | null;
  name: string;
  kind: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  namespace: string | null;
  httpStatus: number | null;
  error: boolean;
  tool: string | null;
  urlPath: string | null;
  targetType: string | null;
  targetId: string | null;
  requestId: string | null;
  errorType: string | null;
  jsonrpcErrorCode: number | null;
  latencyMs: number | null;
  overheadMs: number | null;
  execMs: number | null;
}

interface GatewayLogEntry {
  timestamp: string;
  spanId: string | null;
  isError: boolean;
  log: string | null;
  requestBody: string | null;
  responseBody: string | null;
  errorMessage: string | null;
}

interface TraceDetailResponse {
  traceId: string;
  spans: Span[];
  logs: GatewayLogEntry[];
  status: 'Complete' | 'NotFound' | 'Unavailable';
}

function getStatusBadge(item: TraceListItem) {
  if (item.hasFault) {
    return { bg: 'bg-red-500/15', text: 'text-red-400', label: 'Fault' };
  } else if (item.hasError) {
    return { bg: 'bg-orange-500/15', text: 'text-orange-400', label: 'Error' };
  } else if (item.hasThrottle) {
    return { bg: 'bg-yellow-500/15', text: 'text-yellow-400', label: 'Throttle' };
  } else {
    return { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'OK' };
  }
}

// Renders the latency decomposition for a gateway trace. Unlike a span
// waterfall (which is near-identical for every tool call — one SERVER root
// wrapping one CLIENT subsegment), this answers the question the operator
// actually has: "was the time spent in the gateway or in the target?".
// The split comes from the root span's metadata:
//   overhead_latency_ms  → time inside the gateway (auth, routing, marshalling)
//   execute_tool_latency_ms → time the downstream target took
//   latency_ms           → total end-to-end
function LatencyBreakdown({ spans, traceId }: { spans: Span[]; traceId: string }) {
  if (spans.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="font-mono text-sm">{traceId}</CardTitle>
          <CardDescription>지연 분해</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-24 items-center justify-center text-muted-foreground">
            스팬 정보를 찾을 수 없습니다.
          </div>
        </CardContent>
      </Card>
    );
  }

  const root = spans.find((s) => s.kind === 'SERVER') ?? spans[0];
  const total = root.latencyMs ?? root.durationMs;
  const gateway = root.overheadMs;
  const target = root.execMs;

  // A true split is only possible when both halves are present. Any leftover
  // (total − gateway − target) is unattributed network/queue time.
  const hasSplit = gateway != null && target != null && total > 0;
  const other = hasSplit ? Math.max(0, total - gateway! - target!) : 0;
  const segments = hasSplit
    ? [
        { label: '게이트웨이', ms: gateway!, bar: 'bg-violet-500', dot: 'bg-violet-500' },
        { label: '타깃 실행', ms: target!, bar: 'bg-sky-500', dot: 'bg-sky-500' },
        ...(other > 0
          ? [{ label: '기타/네트워크', ms: other, bar: 'bg-muted-foreground/40', dot: 'bg-muted-foreground/40' }]
          : []),
      ]
    : [];

  // The individual tool invocations (CLIENT subsegments) — useful when a single
  // trace fans out to more than one tool/target.
  const toolSpans = spans.filter((s) => s.kind !== 'SERVER');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-mono text-sm">{traceId}</CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>지연 분해</span>
          {root.urlPath && <span className="font-mono text-xs">{root.urlPath}</span>}
          {root.tool && <span className="font-mono text-xs text-foreground">{root.tool}</span>}
          {root.requestId && (
            <span className="font-mono text-xs text-muted-foreground/70">req {root.requestId}</span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Headline total */}
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">
            {total.toFixed(0)}
          </span>
          <span className="text-sm text-muted-foreground">ms 총 지연</span>
        </div>

        {hasSplit ? (
          <>
            {/* Stacked breakdown bar */}
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted/30">
              {segments.map((seg) => (
                <div
                  key={seg.label}
                  className={seg.bar}
                  style={{ width: `${(seg.ms / total) * 100}%` }}
                  title={`${seg.label} ${seg.ms.toFixed(0)} ms`}
                />
              ))}
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-x-6 gap-y-1.5">
              {segments.map((seg) => (
                <div key={seg.label} className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-sm ${seg.dot}`} />
                  <span className="text-xs text-muted-foreground">{seg.label}</span>
                  <span className="font-mono text-xs tabular-nums text-foreground">
                    {seg.ms.toFixed(0)} ms
                  </span>
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground/70">
                    {((seg.ms / total) * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            이 트레이스에는 지연 분해 메타데이터(overhead/exec)가 없어 총 지연만 표시합니다.
          </p>
        )}

        {/* Per-tool detail when present */}
        {toolSpans.length > 0 && (
          <div className="space-y-1.5 border-t border-border/50 pt-3">
            {toolSpans.map((span) => {
              const chips = [
                span.targetType,
                span.targetId,
                span.httpStatus != null ? `HTTP ${span.httpStatus}` : null,
                span.errorType,
                span.jsonrpcErrorCode != null ? `rpc ${span.jsonrpcErrorCode}` : null,
              ].filter(Boolean) as string[];
              return (
                <div key={span.id} className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span
                      className="truncate font-mono text-xs text-foreground"
                      title={span.name}
                    >
                      {span.tool ?? span.name}
                    </span>
                    {chips.map((c) => (
                      <span
                        key={c}
                        className={`rounded px-1 py-0.5 text-[10px] font-mono ${
                          span.error ? 'bg-red-500/10 text-red-400' : 'bg-muted/40 text-muted-foreground'
                        }`}
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {span.durationMs.toFixed(0)} ms
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Pretty-print a body for the foldable raw view. The gateway logs bodies as a
// Java-style map (not JSON), so we re-indent structurally rather than via
// JSON.parse — see prettyPrintBody.
function formatBody(body: string): string {
  return prettyPrintBody(body);
}

// Distill a requestBody into a one-line summary: the tool/method plus its
// headline argument. Falls back to the method alone, then null.
function summarizeRequest(requestBody: string): { method: string | null; tool: string | null; query: string | null; argCount: number } {
  const method = (parseJavaMap(requestBody).method as string | undefined) ?? null;
  const tool = method === 'tools/call' ? extractToolName(requestBody) : null;
  const args = extractArguments(requestBody);
  const query = typeof args.query === 'string' ? args.query : null;
  return { method, tool, query, argCount: Object.keys(args).length };
}

// Distill a responseBody into a one-line summary: result count + engine +
// embedded latency when the tool returned a JSON result text; otherwise null.
function summarizeResponse(responseBody: string): { resultCount: number | null; engine: string | null; latencyMs: number | null; bytes: number } {
  const text = extractResponseText(responseBody);
  const latencyMs = extractLatencyMs(responseBody);
  let resultCount: number | null = null;
  let engine: string | null = null;
  if (text) {
    try {
      const obj = JSON.parse(text) as { results?: unknown[]; engine?: string };
      if (Array.isArray(obj.results)) resultCount = obj.results.length;
      if (typeof obj.engine === 'string') engine = obj.engine;
    } catch {
      // result text wasn't clean JSON — leave summary fields null.
    }
  }
  return { resultCount, engine, latencyMs, bytes: (text ?? responseBody).length };
}

// A small foldable raw payload, collapsed by default so the summary stays
// scannable but the full body is one click away.
function RawFold({ label, body }: { label: string; body: string }) {
  return (
    <details className="group mt-1">
      <summary className="cursor-pointer select-none text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 hover:text-muted-foreground">
        {label} 원본 보기
      </summary>
      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
        {formatBody(body)}
      </pre>
    </details>
  );
}

// Renders the gateway vended logs joined to the selected trace as a stepped
// timeline: each step shows elapsed time since the request started, a distilled
// request/response summary (not raw Java-map dumps), and any error inlined at
// the step where it occurred. Raw bodies are foldable. This is the "what
// actually happened / why did it fail" panel that X-Ray spans can't give.
function LogTimeline({ logs }: { logs: GatewayLogEntry[] }) {
  if (logs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">요청 로그</CardTitle>
          <CardDescription>
            이 트레이스에 연결된 게이트웨이 로그를 찾지 못했습니다 (인덱싱 지연일 수 있음).
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const t0 = logs[0].timestamp ? Date.parse(logs[0].timestamp) : NaN;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">요청 로그</CardTitle>
        <CardDescription>trace_id로 조인된 게이트웨이 요청·응답·오류 타임라인</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {logs.map((l, i) => {
            const ts = l.timestamp ? Date.parse(l.timestamp) : NaN;
            // Elapsed since the request started, and step delta from the prev line.
            const elapsed = Number.isFinite(ts) && Number.isFinite(t0) ? ts - t0 : null;
            const prevTs = i > 0 && logs[i - 1].timestamp ? Date.parse(logs[i - 1].timestamp) : NaN;
            const delta = Number.isFinite(ts) && Number.isFinite(prevTs) ? ts - prevTs : null;
            const slow = delta != null && delta >= 500;

            const req = l.requestBody ? summarizeRequest(l.requestBody) : null;
            const res = l.responseBody ? summarizeResponse(l.responseBody) : null;
            const toolErr = l.responseBody ? extractToolError(l.responseBody) : null;
            const inlineError = l.errorMessage ?? (l.isError ? l.log : null) ?? toolErr;

            return (
              <li key={i} className="relative border-l-2 border-border/60 pl-4">
                {/* Status dot on the rail */}
                <span
                  className={`absolute -left-[5px] top-1.5 h-2 w-2 rounded-full ring-2 ring-background ${
                    inlineError ? 'bg-red-400' : 'bg-emerald-400'
                  }`}
                />

                {/* Header: elapsed + step delta + label */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  {elapsed != null && (
                    <span className="font-mono text-xs tabular-nums text-foreground">
                      +{elapsed} ms
                    </span>
                  )}
                  {delta != null && delta > 0 && (
                    <span
                      className={`font-mono text-[10px] tabular-nums ${
                        slow ? 'text-amber-400' : 'text-muted-foreground/60'
                      }`}
                    >
                      Δ{delta} ms{slow ? ' ←' : ''}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">{l.log ?? '—'}</span>
                </div>

                {/* Request summary */}
                {req && (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-sky-400">
                      REQ
                    </span>
                    {req.method && (
                      <span className="font-mono text-xs text-muted-foreground">{req.method}</span>
                    )}
                    {req.tool && (
                      <span className="font-mono text-xs text-foreground">{req.tool}</span>
                    )}
                    {req.query != null && (
                      <span className="truncate font-mono text-xs text-muted-foreground" title={req.query}>
                        query: &quot;{req.query}&quot;
                      </span>
                    )}
                  </div>
                )}
                {l.requestBody && <RawFold label="요청" body={l.requestBody} />}

                {/* Response summary */}
                {res && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-violet-400">
                      RES
                    </span>
                    {res.resultCount != null && (
                      <span className="font-mono text-xs text-foreground">{res.resultCount} results</span>
                    )}
                    {res.engine && (
                      <span className="font-mono text-xs text-muted-foreground">{res.engine}</span>
                    )}
                    {res.latencyMs != null && (
                      <span className="font-mono text-xs text-muted-foreground">{res.latencyMs} ms</span>
                    )}
                    <span className="font-mono text-[11px] text-muted-foreground/60">
                      {res.bytes.toLocaleString()} chars
                    </span>
                  </div>
                )}
                {l.responseBody && <RawFold label="응답" body={l.responseBody} />}

                {/* Error inlined at the step where it happened */}
                {inlineError && (
                  <div className="mt-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1.5">
                    <p className="break-words font-mono text-xs text-red-300">{inlineError}</p>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

export default function TracesPage() {
  const [timeRange, setTimeRange] = useState<TraceTimeRangeKey>('24h');
  const [traces, setTraces] = useState<TraceListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [spans, setSpans] = useState<Span[]>([]);
  const [logs, setLogs] = useState<GatewayLogEntry[]>([]);
  const [spansLoading, setSpansLoading] = useState(false);
  // List filters
  const [toolFilter, setToolFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'errors'>('all');
  const [page, setPage] = useState(1);

  // Fetch trace list on mount and when timeRange changes
  useEffect(() => {
    fetchTraces();
  }, [timeRange]);

  // Reset to the first page whenever the filtered set changes underneath us.
  useEffect(() => {
    setPage(1);
  }, [toolFilter, statusFilter, timeRange]);

  const fetchTraces = async () => {
    setLoading(true);
    setNote(null);
    setSelected(null);
    setSpans([]);
    setLogs([]);
    try {
      const response = await fetch(`/api/xray/traces?timeRange=${timeRange}`);
      const data: TraceListResponse = await response.json();

      if (!response.ok) {
        setNote('트레이스를 불러오지 못했습니다.');
        setTraces([]);
      } else {
        setTraces(data.traces || []);
        if (data.status === 'NoData') {
          setNote('해당 기간에 트레이스가 없습니다.');
        } else if (data.status === 'Unavailable' || data.note) {
          setNote(data.note || 'X-Ray 데이터를 사용할 수 없습니다.');
        }
      }
    } catch (err) {
      setNote('트레이스를 불러오지 못했습니다.');
      setTraces([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTrace = async (traceId: string) => {
    setSelected(traceId);
    setSpansLoading(true);
    try {
      const response = await fetch(`/api/xray/traces/${traceId}`);
      const data: TraceDetailResponse = await response.json();

      if (!response.ok || data.status !== 'Complete') {
        setSpans([]);
        setLogs([]);
      } else {
        setSpans(data.spans || []);
        setLogs(data.logs || []);
      }
    } catch (err) {
      setSpans([]);
      setLogs([]);
    } finally {
      setSpansLoading(false);
    }
  };

  // Distinct tools present in the current trace list (for the filter dropdown).
  const toolOptions = Array.from(
    new Set(traces.map((t) => t.tool).filter((t): t is string => Boolean(t)))
  ).sort();

  const visibleTraces = traces.filter((t) => {
    if (statusFilter === 'errors' && !(t.hasFault || t.hasError || t.hasThrottle))
      return false;
    if (toolFilter !== 'all' && t.tool !== toolFilter) return false;
    return true;
  });

  // Clamp the current page to the available range and slice out the rows for it.
  const totalPages = Math.max(1, Math.ceil(visibleTraces.length / TRACES_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * TRACES_PER_PAGE;
  const pagedTraces = visibleTraces.slice(pageStart, pageStart + TRACES_PER_PAGE);

  const timeRangeButtons = (
    <div className="flex gap-2">
      {(
        Object.entries(TRACE_TIME_RANGES) as [
          TraceTimeRangeKey,
          { label: string },
        ][]
      ).map(([key, { label }]) => (
        <Button
          key={key}
          variant={timeRange === key ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTimeRange(key)}
        >
          {label}
        </Button>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={fetchTraces}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RotateCcw className="h-4 w-4" />
        )}
      </Button>
    </div>
  );

  return (
    <AppShell
      title="Traces"
      description="AgentCore Gateway OTEL 스팬 (X-Ray Transaction Search)"
      icon={Activity}
      actions={timeRangeButtons}
    >
      <div className="space-y-6">
        {/* Error or info banner */}
        {note && (
          <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            {note}
          </div>
        )}

        {/* Trace list table */}
        {traces.length > 0 ? (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>트레이스 목록</CardTitle>
                  <CardDescription>
                    {visibleTraces.length}
                    {visibleTraces.length !== traces.length && ` / ${traces.length}`}개 트레이스
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {/* Status filter */}
                  <Button
                    variant={statusFilter === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatusFilter('all')}
                  >
                    전체
                  </Button>
                  <Button
                    variant={statusFilter === 'errors' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatusFilter('errors')}
                  >
                    오류만
                  </Button>
                  {/* Tool filter */}
                  {toolOptions.length > 0 && (
                    <select
                      value={toolFilter}
                      onChange={(e) => setToolFilter(e.target.value)}
                      className="h-8 rounded-md border bg-background px-2 font-mono text-xs"
                    >
                      <option value="all">모든 도구</option>
                      {toolOptions.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                        <th className="py-2 pr-3 font-medium">시각</th>
                        <th className="py-2 px-3 font-medium">도구</th>
                        <th className="py-2 px-3 font-medium text-right">
                          Duration
                        </th>
                        <th className="py-2 px-3 font-medium">HTTP</th>
                        <th className="py-2 pl-3 font-medium text-right">
                          상태
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedTraces.map((trace) => {
                        const isSelected = selected === trace.id;
                        const badgeInfo = getStatusBadge(trace);
                        return (
                          <tr
                            key={trace.id}
                            onClick={() => handleSelectTrace(trace.id)}
                            className={`border-b border-border/40 last:border-0 cursor-pointer hover:bg-muted/40 transition-colors ${
                              isSelected ? 'bg-muted/60' : ''
                            }`}
                          >
                            <td className="py-2 pr-3">
                              {new Date(trace.startTime * 1000).toLocaleString(
                                'ko-KR'
                              )}
                            </td>
                            <td className="py-2 px-3">
                              <span className="font-mono text-xs text-muted-foreground">
                                {trace.tool ?? '—'}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums">
                              {(trace.duration * 1000).toFixed(0)} ms
                            </td>
                            <td className="py-2 px-3">
                              <span className="font-mono text-xs text-muted-foreground">
                                {[trace.httpMethod, trace.httpStatus]
                                  .filter((v) => v != null && v !== '')
                                  .join(' ')}
                              </span>
                            </td>
                            <td className="py-2 pl-3 text-right">
                              <span
                                className={`inline-block rounded px-2 py-1 text-xs font-medium ${badgeInfo.bg} ${badgeInfo.text}`}
                              >
                                {badgeInfo.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Pagination controls */}
                  {totalPages > 1 && (
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {pageStart + 1}–{Math.min(pageStart + TRACES_PER_PAGE, visibleTraces.length)} / {visibleTraces.length}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={currentPage <= 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {currentPage} / {totalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                          disabled={currentPage >= totalPages}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          !loading &&
          !note && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                기간 버튼을 클릭하여 트레이스를 불러오세요
              </CardContent>
            </Card>
          )
        )}

        {/* Latency breakdown + request log detail when a trace is selected */}
        {selected && (
          <div>
            {spansLoading ? (
              <Card>
                <CardContent className="flex items-center justify-center h-32">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                <LatencyBreakdown spans={spans} traceId={selected} />
                <LogTimeline logs={logs} />
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
