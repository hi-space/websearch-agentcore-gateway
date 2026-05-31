'use client';

import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AppShell } from '@/components/shell';
import {
  Loader2,
  BarChart3,
  ShieldCheck,
  KeyRound,
  AlertTriangle,
  Activity,
  Timer,
  ShieldAlert,
  Waves,
  Layers,
  Gauge,
  type LucideIcon,
} from 'lucide-react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { TIME_RANGES, type TimeRangeKey } from '@/lib/constants';

interface ToolStat {
  name: string;
  label: string;
  invocations: number;
  latency: number;
  targetExec: number;
  overhead: number;
  systemErrors: number;
  userErrors: number;
  errors: number;
  errorRate: number;
}

interface MetricsResponse {
  invocations: Array<{ timestamp: string; value: number }>;
  latency: Array<{ timestamp: string; p50: number; p90: number; p99: number }>;
  errors: Array<{ timestamp: string; system_errors: number; user_errors: number }>;
  overhead: Array<{ timestamp: string; total: number; target: number; gateway: number }>;
  tools: ToolStat[];
  toolTrend?: Array<Record<string, number | string>>;
  toolTrendSeries?: Array<{ name: string; label: string }>;
  auth?: {
    inboundSuccess: number;
    inboundFailure: number;
    inboundFailureByType: Array<{ exceptionType: string; count: number }>;
    apiKeySuccess: number;
    apiKeyFailure: number;
    apiKeySuccessByProvider: Array<{ provider: string; count: number }>;
    apiKeyFailureByProvider: Array<{ label: string; count: number }>;
  };
  summary?: {
    total_invocations: number;
    total_system_errors: number;
    total_user_errors: number;
    total_throttles: number;
    error_rate: number;
    avg_latency: number;
    avg_target_exec: number;
  };
}

// Categorical palette for per-tool series. Index 0 is reserved for the live
// brand teal (resolved from CSS vars); the rest are fixed hues chosen to stay
// legible on both the light paper and dark ink backgrounds.
const TOOL_PALETTE = ['#6195f0', '#f5b14b', '#b07cf6', '#fb6f92', '#38bdf8', '#5eead4'];

// Resolve chart styling from live CSS variables so charts track light/dark.
function useChartTheme() {
  const [theme, setTheme] = useState({
    axis: '#8595b3',
    grid: '#1d293f',
    surface: '#0f1626',
    border: '#243150',
    text: '#e8edf7',
    primary: '#34e3c0',
    warn: '#f5b14b',
    danger: '#fb5d6d',
  });

  useEffect(() => {
    const read = () => {
      const s = getComputedStyle(document.documentElement);
      const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
      setTheme({
        axis: v('--muted-foreground', '#8595b3'),
        grid: v('--border', '#1d293f'),
        surface: v('--popover', '#0f1626'),
        border: v('--input', '#243150'),
        text: v('--popover-foreground', '#e8edf7'),
        primary: v('--primary', '#34e3c0'),
        warn: '#f5b14b',
        danger: v('--destructive', '#fb5d6d'),
      });
    };
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  return theme;
}

function formatAxisTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

// Append an alpha byte to a 6-digit hex color (e.g. tinted icon chips / fills).
function tint(hex: string, alpha: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}${alpha}` : hex;
}

// A compact inline trend used inside the KPI cards.
function Sparkline({ id, data, color }: { id: string; data: number[]; color: string }) {
  const series = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={34}>
      <AreaChart data={series} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.75}
          fill={`url(#spark-${id})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  spark,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: ReactNode;
  accent: string;
  spark?: ReactNode;
}) {
  return (
    <div
      className="group relative overflow-hidden rounded-xl border surface-glass edge-light p-4 transition-shadow"
      style={{ ['--kpi' as string]: accent }}
    >
      {/* faint accent wash that warms on hover */}
      <span
        className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full opacity-50 blur-2xl transition-opacity duration-300 group-hover:opacity-90"
        style={{ background: tint(accent, '33') }}
      />
      <div className="relative flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
          <p className="mt-1.5 font-display text-3xl font-bold leading-none tracking-tight" style={{ color: accent }}>
            {value}
          </p>
        </div>
        <span
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ background: tint(accent, '1f'), color: accent }}
        >
          <Icon className="h-[18px] w-[18px]" strokeWidth={2.1} />
        </span>
      </div>
      {sub && <p className="relative mt-2 text-xs text-muted-foreground">{sub}</p>}
      {spark && <div className="relative mt-2 -mb-1">{spark}</div>}
    </div>
  );
}

// A consistent panel wrapper for every chart so the page reads as a grid of
// equal-weight cards rather than a long scroll of bare borders.
function Panel({
  title,
  hint,
  legend,
  children,
}: {
  title: string;
  hint?: string;
  legend?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="surface-glass edge-light rounded-xl border p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-sm font-bold tracking-tight">{title}</h3>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {legend}
      </div>
      {children}
    </div>
  );
}

export default function ObservabilityPage() {
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('24h');
  const [isLoading, setIsLoading] = useState(false);
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ct = useChartTheme();

  const AXIS = { stroke: ct.axis, fontSize: 12 };
  const GRID_STROKE = ct.grid;
  const TOOLTIP_STYLE = {
    contentStyle: {
      background: ct.surface,
      border: `1px solid ${ct.border}`,
      borderRadius: 10,
      color: ct.text,
      fontSize: 12,
    },
    labelStyle: { color: ct.axis },
    cursor: { stroke: ct.primary, strokeOpacity: 0.25 },
  };

  useEffect(() => {
    loadMetrics();
  }, [timeRange]);

  const loadMetrics = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/cw/metrics?timeRange=${timeRange}`);
      const data = await response.json();
      if (!response.ok) {
        setError(data.details || data.error || 'Failed to load metrics');
        setMetrics(null);
      } else {
        setMetrics(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setMetrics(null);
    } finally {
      setIsLoading(false);
    }
  };

  const auth = metrics?.auth;
  const summary = metrics?.summary;
  const tools = useMemo(() => metrics?.tools ?? [], [metrics]);
  const trend = metrics?.toolTrend ?? [];
  const trendSeries = metrics?.toolTrendSeries ?? [];

  // Stable color per tool — the busiest tool gets the brand teal, the rest take
  // the categorical palette. The same map drives the trend, the bars and the
  // table dots so a tool keeps one identity everywhere on the page.
  const toolColor = useMemo(() => {
    const m = new Map<string, string>();
    tools.forEach((t, i) => {
      m.set(t.name, i === 0 ? ct.primary : TOOL_PALETTE[(i - 1) % TOOL_PALETTE.length]);
    });
    m.set('__others__', ct.axis);
    return m;
  }, [tools, ct]);

  const toolsByLatency = useMemo(() => [...tools].sort((a, b) => b.latency - a.latency), [tools]);

  const gwOverhead = summary ? Math.max(0, summary.avg_latency - summary.avg_target_exec) : 0;

  return (
    <AppShell
      title="Observability"
      description="게이트웨이 성능에 대한 CloudWatch 메트릭"
      icon={BarChart3}
    >
      <div>
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>CloudWatch Metrics</CardTitle>
                <CardDescription>게이트웨이 성능 및 호출 메트릭</CardDescription>
              </div>
              <div className="flex gap-2">
                {(Object.entries(TIME_RANGES) as [TimeRangeKey, { label: string }][]).map(
                  ([key, { label }]) => (
                    <Button
                      key={key}
                      variant={timeRange === key ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTimeRange(key)}
                    >
                      {label}
                    </Button>
                  )
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="text-center text-destructive py-12 text-sm">{error}</div>
            ) : metrics ? (
              <div className="space-y-6">
                {/* ---- KPI summary cards ---- */}
                {summary && (
                  <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    <KpiCard
                      icon={Activity}
                      label="총 호출 수"
                      value={summary.total_invocations.toLocaleString()}
                      accent={ct.primary}
                      sub={
                        <span className="inline-flex items-center gap-1.5">
                          <Layers className="h-3 w-3" />
                          {tools.length}개 도구 활성
                        </span>
                      }
                      spark={
                        <Sparkline
                          id="inv"
                          color={ct.primary}
                          data={(metrics.invocations || []).map((d) => d.value)}
                        />
                      }
                    />
                    <KpiCard
                      icon={Timer}
                      label="평균 지연"
                      value={`${summary.avg_latency.toLocaleString()} ms`}
                      accent={ct.primary}
                      sub={
                        <>
                          도구 실행{' '}
                          <span className="font-medium text-foreground">{summary.avg_target_exec.toLocaleString()}ms</span>
                          {' · GW '}
                          <span className="font-medium" style={{ color: gwOverhead > 200 ? ct.warn : undefined }}>
                            {gwOverhead.toLocaleString()}ms
                          </span>
                        </>
                      }
                      spark={
                        <Sparkline
                          id="lat"
                          color={ct.primary}
                          data={(metrics.latency || []).map((d) => d.p50)}
                        />
                      }
                    />
                    <KpiCard
                      icon={summary.error_rate > 0 ? ShieldAlert : ShieldCheck}
                      label="에러율"
                      value={pct(summary.error_rate)}
                      accent={summary.error_rate > 0 ? ct.danger : ct.primary}
                      sub={
                        <>
                          시스템 <span className="font-medium text-foreground">{summary.total_system_errors.toLocaleString()}</span>
                          {' · 사용자 '}
                          <span className="font-medium text-foreground">{summary.total_user_errors.toLocaleString()}</span>
                        </>
                      }
                      spark={
                        <Sparkline
                          id="err"
                          color={summary.error_rate > 0 ? ct.danger : ct.axis}
                          data={(metrics.errors || []).map((d) => d.system_errors + d.user_errors)}
                        />
                      }
                    />
                    <KpiCard
                      icon={summary.total_throttles > 0 ? Waves : Gauge}
                      label="스로틀"
                      value={summary.total_throttles.toLocaleString()}
                      accent={summary.total_throttles > 0 ? ct.warn : ct.primary}
                      sub={
                        summary.total_throttles > 0 ? (
                          <span className="inline-flex items-center gap-1.5" style={{ color: ct.warn }}>
                            <AlertTriangle className="h-3 w-3" />
                            요청 제한 발생
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <ShieldCheck className="h-3 w-3" style={{ color: ct.primary }} />
                            제한 없이 정상 처리
                          </span>
                        )
                      }
                    />
                  </div>
                )}

                {/* ---- Headline: per-tool call volume over time ---- */}
                {trend.length > 0 && trendSeries.length > 0 && (
                  <Panel
                    title="시간대별 도구별 호출 추이"
                    hint="각 시간 버킷에서 도구가 차지한 호출량 (누적 영역)"
                    legend={
                      <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">
                        {trendSeries.map((s) => (
                          <span key={s.name} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span
                              className="h-2 w-2 rounded-sm"
                              style={{ background: toolColor.get(s.name) ?? ct.axis }}
                            />
                            {s.label}
                          </span>
                        ))}
                      </div>
                    }
                  >
                    <ResponsiveContainer width="100%" height={320}>
                      <AreaChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                        <defs>
                          {trendSeries.map((s) => {
                            const c = toolColor.get(s.name) ?? ct.axis;
                            return (
                              <linearGradient key={s.name} id={`trend-${s.name}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={c} stopOpacity={0.7} />
                                <stop offset="100%" stopColor={c} stopOpacity={0.18} />
                              </linearGradient>
                            );
                          })}
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                        <XAxis dataKey="timestamp" tickFormatter={formatAxisTime} minTickGap={32} {...AXIS} />
                        <YAxis {...AXIS} allowDecimals={false} />
                        <Tooltip {...TOOLTIP_STYLE} labelFormatter={(v) => formatAxisTime(String(v))} />
                        {trendSeries.map((s) => {
                          const c = toolColor.get(s.name) ?? ct.axis;
                          return (
                            <Area
                              key={s.name}
                              type="monotone"
                              dataKey={s.name}
                              name={s.label}
                              stackId="tools"
                              stroke={c}
                              strokeWidth={1.5}
                              fill={`url(#trend-${s.name})`}
                              isAnimationActive={false}
                            />
                          );
                        })}
                      </AreaChart>
                    </ResponsiveContainer>
                  </Panel>
                )}

                {/* ---- Per-tool: calls + average latency, side by side ---- */}
                {tools.length > 0 && (
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <Panel title="도구별 호출 수" hint="기간 내 총 호출량 (많은 순)">
                      <ResponsiveContainer width="100%" height={Math.max(200, tools.length * 34)}>
                        <BarChart data={tools} layout="vertical" margin={{ left: 8, right: 12 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                          <XAxis type="number" {...AXIS} allowDecimals={false} />
                          <YAxis type="category" dataKey="label" width={150} {...AXIS} tick={{ fontSize: 11 }} />
                          <Tooltip {...TOOLTIP_STYLE} cursor={{ fill: tint(ct.primary, '14') }} />
                          <Bar dataKey="invocations" name="호출" radius={[0, 3, 3, 0]}>
                            {tools.map((t) => (
                              <Cell key={t.name} fill={toolColor.get(t.name) ?? ct.primary} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </Panel>

                    <Panel title="도구별 평균 지연" hint="전체 왕복 지연 평균 (ms, 느린 순)">
                      <ResponsiveContainer width="100%" height={Math.max(200, toolsByLatency.length * 34)}>
                        <BarChart data={toolsByLatency} layout="vertical" margin={{ left: 8, right: 12 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                          <XAxis type="number" {...AXIS} unit=" ms" />
                          <YAxis type="category" dataKey="label" width={150} {...AXIS} tick={{ fontSize: 11 }} />
                          <Tooltip {...TOOLTIP_STYLE} cursor={{ fill: tint(ct.primary, '14') }} />
                          <Bar dataKey="latency" name="평균 지연" radius={[0, 3, 3, 0]}>
                            {toolsByLatency.map((t) => (
                              <Cell key={t.name} fill={toolColor.get(t.name) ?? ct.primary} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </Panel>
                  </div>
                )}

                {/* ---- Gateway-wide trends: invocations + latency percentiles ---- */}
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <Panel title="전체 호출 추이" hint="게이트웨이 전체 호출 수">
                    <ResponsiveContainer width="100%" height={280}>
                      <AreaChart data={metrics.invocations || []} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                        <defs>
                          <linearGradient id="inv-area" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={ct.primary} stopOpacity={0.45} />
                            <stop offset="100%" stopColor={ct.primary} stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                        <XAxis dataKey="timestamp" tickFormatter={formatAxisTime} minTickGap={32} {...AXIS} />
                        <YAxis {...AXIS} allowDecimals={false} />
                        <Tooltip {...TOOLTIP_STYLE} labelFormatter={(v) => formatAxisTime(String(v))} />
                        <Area
                          type="monotone"
                          dataKey="value"
                          name="호출"
                          stroke={ct.primary}
                          strokeWidth={2}
                          fill="url(#inv-area)"
                          dot={false}
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </Panel>

                  <Panel title="지연 백분위" hint="p50 / p90 / p99 (ms)">
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={metrics.latency || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                        <XAxis dataKey="timestamp" tickFormatter={formatAxisTime} minTickGap={32} {...AXIS} />
                        <YAxis {...AXIS} />
                        <Tooltip {...TOOLTIP_STYLE} labelFormatter={(v) => formatAxisTime(String(v))} />
                        <Legend />
                        <Line type="monotone" dataKey="p50" stroke={ct.primary} strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="p90" stroke={ct.warn} strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="p99" stroke={ct.danger} strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </Panel>
                </div>

                {/* ---- Gateway overhead + errors ---- */}
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <Panel
                    title="게이트웨이 오버헤드"
                    hint="전체 지연에서 도구 실행 시간을 분리 (ms) — 지연 원인 진단용"
                  >
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={metrics.overhead || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                        <XAxis dataKey="timestamp" tickFormatter={formatAxisTime} minTickGap={32} {...AXIS} />
                        <YAxis {...AXIS} />
                        <Tooltip {...TOOLTIP_STYLE} labelFormatter={(v) => formatAxisTime(String(v))} />
                        <Legend />
                        <Bar dataKey="target" name="도구 실행" stackId="lat" fill={ct.primary} />
                        <Bar dataKey="gateway" name="게이트웨이" stackId="lat" fill={ct.warn} radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Panel>

                  <Panel title="오류" hint="시스템 / 사용자 오류 건수">
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={metrics.errors || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                        <XAxis dataKey="timestamp" tickFormatter={formatAxisTime} minTickGap={32} {...AXIS} />
                        <YAxis {...AXIS} allowDecimals={false} />
                        <Tooltip {...TOOLTIP_STYLE} labelFormatter={(v) => formatAxisTime(String(v))} />
                        <Legend />
                        <Bar dataKey="system_errors" name="시스템" stackId="a" fill={ct.danger} />
                        <Bar dataKey="user_errors" name="사용자" stackId="a" fill={ct.warn} radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Panel>
                </div>

                {/* ---- Auth & API-key health ---- */}
                {auth && (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {/* Inbound (Cognito M2M) */}
                    <div className="surface-glass edge-light rounded-xl border p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md" style={{ background: tint(ct.primary, '1f'), color: ct.primary }}>
                          <ShieldCheck className="h-4 w-4" />
                        </span>
                        <h3 className="font-display text-sm font-bold tracking-tight">인바운드 인증 (Cognito M2M)</h3>
                      </div>
                      <div className="flex items-baseline gap-6">
                        <div>
                          <p className="text-xs text-muted-foreground">성공</p>
                          <p className="font-display text-2xl font-bold" style={{ color: ct.primary }}>
                            {auth.inboundSuccess.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">실패</p>
                          <p
                            className="font-display text-2xl font-bold"
                            style={{ color: auth.inboundFailure > 0 ? ct.danger : undefined }}
                          >
                            {auth.inboundFailure.toLocaleString()}
                          </p>
                        </div>
                      </div>
                      {auth.inboundFailureByType.length > 0 && (
                        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                          {auth.inboundFailureByType.map((f) => (
                            <li key={f.exceptionType} className="flex items-center gap-1.5">
                              <AlertTriangle className="h-3 w-3" style={{ color: ct.warn }} />
                              <span className="font-mono">{f.exceptionType}</span>
                              <span className="ml-auto tabular-nums">{f.count}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Outbound API keys / token vault */}
                    <div className="surface-glass edge-light rounded-xl border p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md" style={{ background: tint(ct.primary, '1f'), color: ct.primary }}>
                          <KeyRound className="h-4 w-4" />
                        </span>
                        <h3 className="font-display text-sm font-bold tracking-tight">API 키 / 토큰 볼트</h3>
                      </div>
                      <div className="flex items-baseline gap-6">
                        <div>
                          <p className="text-xs text-muted-foreground">조회 성공</p>
                          <p className="font-display text-2xl font-bold" style={{ color: ct.primary }}>
                            {auth.apiKeySuccess.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">조회 실패</p>
                          <p
                            className="font-display text-2xl font-bold"
                            style={{ color: auth.apiKeyFailure > 0 ? ct.danger : undefined }}
                          >
                            {auth.apiKeyFailure.toLocaleString()}
                          </p>
                        </div>
                      </div>
                      {auth.apiKeyFailureByProvider.length > 0 && (
                        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                          {auth.apiKeyFailureByProvider.map((f) => (
                            <li key={f.label} className="flex items-center gap-1.5">
                              <AlertTriangle className="h-3 w-3" style={{ color: ct.warn }} />
                              <span className="font-mono truncate">{f.label}</span>
                              <span className="ml-auto tabular-nums">{f.count}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}

                {/* ---- Per-tool breakdown table ---- */}
                {tools.length > 0 && (
                  <Panel title="도구별 상세" hint="엔진별 호출 수, 지연(전체 / 도구 실행), 에러율">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                            <th className="py-2 pr-3 font-medium">도구</th>
                            <th className="py-2 px-3 font-medium text-right">호출</th>
                            <th className="py-2 px-3 font-medium text-right">지연(ms)</th>
                            <th className="py-2 px-3 font-medium text-right">도구 실행(ms)</th>
                            <th className="py-2 px-3 font-medium text-right">GW오버헤드</th>
                            <th className="py-2 pl-3 font-medium text-right">에러율</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tools.map((t) => (
                            <tr key={t.name} className="border-b border-border/40 last:border-0">
                              <td className="py-2 pr-3">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                                    style={{ background: toolColor.get(t.name) ?? ct.primary }}
                                  />
                                  <span className="font-mono text-xs">{t.label}</span>
                                </div>
                              </td>
                              <td className="py-2 px-3 text-right tabular-nums">{t.invocations.toLocaleString()}</td>
                              <td className="py-2 px-3 text-right tabular-nums">{t.latency.toLocaleString()}</td>
                              <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{t.targetExec.toLocaleString()}</td>
                              <td className="py-2 px-3 text-right tabular-nums" style={{ color: t.overhead > 200 ? ct.warn : undefined }}>
                                {t.overhead.toLocaleString()}
                              </td>
                              <td className="py-2 pl-3 text-right tabular-nums" style={{ color: t.errorRate > 0 ? ct.danger : undefined }}>
                                {pct(t.errorRate)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Panel>
                )}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-12">
기간 버튼을 클릭하여 메트릭을 불러오세요
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
