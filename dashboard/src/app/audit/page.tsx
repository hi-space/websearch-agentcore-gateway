'use client';

import { useState, useMemo, useEffect } from 'react';
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AppShell } from '@/components/shell';
import { Loader2, FileText, Activity, AlertTriangle, Timer, Wrench } from 'lucide-react';
import { TIME_RANGES } from '@/lib/constants';
import { ToolCallRow, type ToolCall } from './tool-call-row';

// Read chart colors from the CSS theme so cards match the rest of the dashboard
// (mirrors observability's useChartTheme). Falls back to sensible dark defaults.
function useChartTheme() {
  const [theme, setTheme] = useState({ primary: '#34e3c0', warn: '#f5b14b', danger: '#fb5d6d', muted: '#8595b3' });
  useEffect(() => {
    const s = getComputedStyle(document.documentElement);
    const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
    setTheme({
      primary: v('--primary', '#34e3c0'),
      warn: '#f5b14b',
      danger: v('--destructive', '#fb5d6d'),
      muted: v('--muted-foreground', '#8595b3'),
    });
  }, []);
  return theme;
}

const hhmm = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

// Bucket calls into ~12 equal time bins between the first and last call so the
// volume sparkline shows traffic shape regardless of the absolute time range.
// Each bucket carries its time window so the tooltip can label it.
function volumeBuckets(calls: ToolCall[]): { v: number; label: string }[] {
  const times = calls
    .map((c) => Date.parse(c.timestamp))
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);
  if (times.length === 0) return [];
  const BINS = 12;
  const min = times[0];
  const max = times[times.length - 1];
  const span = max - min || 1;
  const buckets = new Array(BINS).fill(0);
  for (const t of times) {
    const idx = Math.min(BINS - 1, Math.floor(((t - min) / span) * BINS));
    buckets[idx]++;
  }
  const step = span / BINS;
  return buckets.map((v, i) => ({
    v,
    label: `${hhmm(min + i * step)}~${hhmm(min + (i + 1) * step)}`,
  }));
}

export default function AuditPage() {
  const [timeRange, setTimeRange] = useState('24h');
  const [filterTool, setFilterTool] = useState('');
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [showListing, setShowListing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [hasQueried, setHasQueried] = useState(false);

  const handleLoadLogs = async () => {
    setIsLoading(true);
    setHasQueried(true);
    try {
      const params = new URLSearchParams({
        timeRange,
        ...(filterTool && { tool: filterTool }),
        ...(errorsOnly && { error: '1' }),
      });
      const response = await fetch(`/api/cw/logs?${params}`);
      const data = await response.json();
      if (!response.ok) {
        setError(data.details || data.error || 'Failed to query logs');
        setToolCalls([]);
        setNote(null);
      } else {
        setToolCalls(Array.isArray(data.toolCalls) ? data.toolCalls : []);
        setNote(data.note ?? null);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setToolCalls([]);
    } finally {
      setIsLoading(false);
    }
  };

  // tools/list calls are protocol noise; hide unless the user opts in.
  const visible = useMemo(
    () => toolCalls.filter((c) => showListing || !c.isListing),
    [toolCalls, showListing]
  );

  // Summary metrics always describe real tool calls (never tools/list protocol
  // noise), independent of the show-listing toggle, so the numbers stay stable.
  const summary = useMemo(() => {
    const calls = toolCalls.filter((c) => !c.isListing);
    const errors = calls.filter((c) => c.status !== 'success').length;
    const gatewayErrors = calls.filter((c) => c.status === 'gateway-error').length;
    const toolErrors = calls.filter((c) => c.status === 'tool-error').length;
    const successRate = calls.length ? Math.round(((calls.length - errors) / calls.length) * 100) : null;

    const latencies = calls.map((c) => c.latencyMs).filter((n): n is number => n != null);
    const avgLatency = latencies.length
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : null;
    const maxLatency = latencies.length ? Math.max(...latencies) : null;
    // Per-call latency sparkline in chronological order (calls arrive newest-first).
    // Each point carries its tool + query so the tooltip can identify the call.
    const latencySeries = calls
      .filter((c) => c.latencyMs != null)
      .slice()
      .reverse()
      .map((c) => ({
        v: c.latencyMs as number,
        label: c.tool ?? (c.toolFull ?? '호출'),
        query: c.query,
      }));

    // Top tools by invocation count, for the mini bar list.
    const byTool = new Map<string, number>();
    for (const c of calls) {
      const name = c.tool ?? '알 수 없음';
      byTool.set(name, (byTool.get(name) ?? 0) + 1);
    }
    const topTools = [...byTool.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return {
      total: calls.length,
      errors,
      gatewayErrors,
      toolErrors,
      successRate,
      avgLatency,
      maxLatency,
      latencySeries,
      toolCount: byTool.size,
      topTools,
      volume: volumeBuckets(calls),
    };
  }, [toolCalls]);

  const ct = useChartTheme();

  return (
    <AppShell title="Audit Logs" description="도구 호출 단위 감사 로그 (CloudWatch)" icon={FileText}>
      <div>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>도구 호출 조회</CardTitle>
            <CardDescription>게이트웨이 애플리케이션 로그를 도구 호출 단위로 묶어 표시합니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="timeRange">기간</Label>
                <select
                  id="timeRange"
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {Object.entries(TIME_RANGES).map(([key, { label }]) => (
                    <option key={key} value={key} className="bg-popover text-popover-foreground">
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="filterTool">도구 이름 (선택)</Label>
                <Input
                  id="filterTool"
                  placeholder="e.g., serper, exa"
                  value={filterTool}
                  onChange={(e) => setFilterTool(e.target.value)}
                />
              </div>
              <div className="flex flex-col justify-end gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={errorsOnly} onChange={(e) => setErrorsOnly(e.target.checked)} />
                  에러만 보기
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={showListing} onChange={(e) => setShowListing(e.target.checked)} />
                  프로토콜 호출(tools/list) 표시
                </label>
              </div>
            </div>
            <Button onClick={handleLoadLogs} disabled={isLoading} className="w-full">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  로그 불러오는 중...
                </>
              ) : (
                '로그 조회'
              )}
            </Button>
          </CardContent>
        </Card>

        {error && (
          <Card className="mb-6 border-destructive">
            <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {note && !error && (
          <Card className="mb-6">
            <CardContent className="py-4 text-sm text-muted-foreground">{note}</CardContent>
          </Card>
        )}

        {visible.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
            {/* 호출: total + success rate, with a volume sparkline behind it. */}
            <StatCard
              icon={Activity}
              iconColor={ct.primary}
              label="호출"
              value={String(summary.total)}
              sub={summary.successRate == null ? '성공률 —' : `성공률 ${summary.successRate}%`}
            >
              {summary.volume.length > 1 && (
                <ResponsiveContainer width="100%" height={44}>
                  <AreaChart data={summary.volume} margin={{ top: 4, right: 0, bottom: 2, left: 0 }}>
                    <defs>
                      <linearGradient id="auditVol" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={ct.primary} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={ct.primary} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Tooltip
                      cursor={{ stroke: ct.primary, strokeOpacity: 0.3 }}
                      content={<SparkTooltip unit="호출" />}
                    />
                    <Area type="monotone" dataKey="v" stroke={ct.primary} strokeWidth={1.5} fill="url(#auditVol)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </StatCard>

            {/* 에러: count + breakdown into gateway/tool errors. */}
            <StatCard
              icon={AlertTriangle}
              iconColor={summary.errors > 0 ? ct.danger : ct.muted}
              label="에러"
              value={String(summary.errors)}
              sub={summary.errors > 0 ? `게이트웨이 ${summary.gatewayErrors} · 도구 ${summary.toolErrors}` : '에러 없음'}
              highlight={summary.errors > 0}
            >
              <ErrorBar
                total={summary.total}
                errors={summary.errors}
                toolErrors={summary.toolErrors}
                gatewayErrors={summary.gatewayErrors}
                ct={ct}
              />
            </StatCard>

            {/* 평균 지연: avg + max, with a per-call latency bar sparkline. */}
            <StatCard
              icon={Timer}
              iconColor={ct.warn}
              label="평균 지연"
              value={summary.avgLatency == null ? '—' : fmtMs(summary.avgLatency)}
              sub={summary.maxLatency == null ? '최대 —' : `최대 ${fmtMs(summary.maxLatency)}`}
            >
              {summary.latencySeries.length > 1 && (
                <ResponsiveContainer width="100%" height={44}>
                  <BarChart data={summary.latencySeries} margin={{ top: 4, right: 0, bottom: 2, left: 0 }}>
                    <Tooltip
                      cursor={{ fill: ct.warn, fillOpacity: 0.12 }}
                      content={<SparkTooltip unit="ms" />}
                    />
                    <Bar dataKey="v" fill={ct.warn} radius={[1, 1, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </StatCard>

            {/* 도구: distinct count + top tools mini bar list. */}
            <StatCard
              icon={Wrench}
              iconColor={ct.primary}
              label="도구"
              value={String(summary.toolCount)}
              sub={`${summary.topTools.length}개 사용됨`}
            >
              <div className="mt-2 space-y-1">
                {summary.topTools.slice(0, 3).map((t) => (
                  <HoverTip
                    key={t.name}
                    className="flex items-center gap-2"
                    tip={
                      <>
                        <div className="text-muted-foreground">{t.name}</div>
                        <div className="font-semibold tabular-nums">
                          {t.count}회 (전체의 {pctOf(t.count, summary.total).toFixed(0)}%)
                        </div>
                      </>
                    }
                  >
                    <span className="w-12 shrink-0 truncate text-[10px] text-muted-foreground">{t.name}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pctOf(t.count, summary.topTools[0]?.count ?? 1)}%`, background: ct.primary }}
                      />
                    </div>
                    <span className="w-5 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">{t.count}</span>
                  </HoverTip>
                ))}
              </div>
            </StatCard>
          </div>
        )}

        {hasQueried && !isLoading && !error && visible.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              조회 조건에 맞는 도구 호출이 없습니다.
            </CardContent>
          </Card>
        )}

        {visible.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>도구 호출 {visible.length}건</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[32rem] overflow-y-auto">
                {visible.map((call) => (
                  <ToolCallRow key={call.traceId} call={call} />
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

// Safe percentage for inline bar widths; clamps to [0,100] and avoids /0.
function pctOf(part: number, whole: number): number {
  if (!whole || whole <= 0) return 0;
  return Math.max(0, Math.min(100, (part / whole) * 100));
}

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

// CSS hover tooltip for the non-recharts (plain <div>) bars, styled to match the
// recharts SparkTooltip. The wrapper IS the hover target and positions the tip
// above it; the tip escapes any clipping because the wrapper is not overflow-hidden.
function HoverTip({
  tip,
  children,
  className,
  style,
}: {
  tip: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`group/tip relative ${className ?? ''}`} style={style}>
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap opacity-0 transition-opacity duration-100 group-hover/tip:opacity-100">
        <div className="surface-glass edge-light rounded-md border px-2 py-1 text-[11px] shadow-md">{tip}</div>
      </div>
    </div>
  );
}

// The error card's stacked bar: a clipped visual bar plus transparent hover
// zones (one per segment) that carry a HoverTip. Zones are slightly taller than
// the 6px bar so they're easy to hover.
function ErrorBar({
  total,
  errors,
  toolErrors,
  gatewayErrors,
  ct,
}: {
  total: number;
  errors: number;
  toolErrors: number;
  gatewayErrors: number;
  ct: { primary: string; warn: string; danger: string };
}) {
  const segs = [
    { key: 's', label: '성공', count: total - errors, color: ct.primary },
    { key: 't', label: '도구 에러', count: toolErrors, color: ct.warn },
    { key: 'g', label: '게이트웨이 에러', count: gatewayErrors, color: ct.danger },
  ].filter((s) => s.count > 0);
  let acc = 0;
  return (
    <div className="relative mt-2">
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
        {segs.map((s) => (
          <div key={s.key} className="h-full" style={{ width: `${pctOf(s.count, total)}%`, background: s.color }} />
        ))}
      </div>
      {segs.map((s) => {
        const left = pctOf(acc, total);
        const width = pctOf(s.count, total);
        acc += s.count;
        return (
          <HoverTip
            key={s.key}
            className="absolute -top-1.5 -bottom-1.5"
            style={{ left: `${left}%`, width: `${width}%` }}
            tip={
              <>
                <div className="text-muted-foreground">{s.label}</div>
                <div className="font-semibold tabular-nums">{s.count} ({width.toFixed(0)}%)</div>
              </>
            }
          />
        );
      })}
    </div>
  );
}

// Compact tooltip for the sparklines: a label line (time window or tool/query)
// plus the value. `unit` distinguishes the volume chart ("호출") from latency ("ms").
function SparkTooltip({
  active,
  payload,
  unit,
}: {
  active?: boolean;
  payload?: Array<{ payload: { v: number; label?: string; query?: string | null } }>;
  unit: string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const value = unit === 'ms' ? fmtMs(d.v) : `${d.v} ${unit}`;
  return (
    <div className="surface-glass edge-light rounded-md border px-2 py-1 text-[11px] shadow-md">
      {d.label && <div className="text-muted-foreground">{d.label}</div>}
      {d.query && <div className="max-w-40 truncate text-muted-foreground">query=&quot;{d.query}&quot;</div>}
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  iconColor,
  label,
  value,
  sub,
  highlight,
  children,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  iconColor: string;
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={`surface-glass edge-light border rounded-lg p-4 ${highlight ? 'border-red-600/50 bg-red-500/5' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className={`mt-0.5 text-2xl font-semibold tabular-nums ${highlight ? 'text-red-600' : ''}`}>{value}</div>
        </div>
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
          style={{ background: `${iconColor}1a` }}
        >
          <Icon className="h-4 w-4" style={{ color: iconColor }} />
        </span>
      </div>
      {sub && <div className="mt-1 text-[11px] text-muted-foreground truncate">{sub}</div>}
      {children}
    </div>
  );
}
