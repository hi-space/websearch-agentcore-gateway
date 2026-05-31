'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Activity,
  Search,
  ShieldCheck,
  Layers,
  CheckCircle2,
  AlertTriangle,
  LayoutDashboard,
  Loader2,
  Info,
} from 'lucide-react';
import { AppShell, NAV_ITEMS } from '@/components/shell';
import {
  AWS_REGION,
  GATEWAY_ID,
  GATEWAY_URL,
  COGNITO_DOMAIN,
  COGNITO_CLIENT_ID,
} from '@/lib/constants';

interface GatewayOverview {
  gatewayId: string;
  name?: string;
  status?: string;
  protocolType?: string;
  authorizerType?: string;
  allowedClients: string[];
  targets: Array<{ name: string; status: string; targetId: string }>;
}

const KPIS = [
  { label: '검색 엔진', value: '5', sub: '하나의 게이트웨이로 통합', icon: Search },
  { label: '프로토콜', value: 'MCP', sub: 'AgentCore Gateway', icon: Layers },
  { label: '인증', value: 'Cognito', sub: 'M2M + JWT', icon: ShieldCheck },
  { label: '리전', value: AWS_REGION, sub: '배포 리전', icon: Activity },
];

const ENV_CHECKS = [
  { key: 'NEXT_PUBLIC_GATEWAY_ID', value: GATEWAY_ID },
  { key: 'NEXT_PUBLIC_GATEWAY_URL', value: GATEWAY_URL },
  { key: 'NEXT_PUBLIC_COGNITO_DOMAIN', value: COGNITO_DOMAIN },
  { key: 'NEXT_PUBLIC_COGNITO_CLIENT_ID', value: COGNITO_CLIENT_ID },
];

function maskValue(v: string): string {
  if (!v) return 'not set';
  if (v.length <= 10) return v;
  return `${v.slice(0, 6)}…${v.slice(-4)}`;
}

export default function Home() {
  const configured = ENV_CHECKS.filter((c) => c.value).length;
  const allConfigured = configured === ENV_CHECKS.length;

  const [overview, setOverview] = useState<GatewayOverview | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);

  const loadAccess = async () => {
    setAccessLoading(true);
    setAccessError(null);
    try {
      const res = await fetch('/api/access');
      const data = await res.json();
      if (!res.ok) {
        setAccessError(data.details || data.error || 'Failed to load access state');
      } else {
        setOverview(data.overview);
      }
    } catch (err) {
      setAccessError(err instanceof Error ? err.message : String(err));
    } finally {
      setAccessLoading(false);
    }
  };

  useEffect(() => {
    loadAccess();
  }, []);

  return (
    <AppShell
      title="Overview"
      description="게이트웨이 상태, 구성, 콘솔 모듈"
      icon={LayoutDashboard}
    >
      <div className="space-y-8">
        {/* KPI row */}
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border/60 lg:grid-cols-4">
          {KPIS.map((kpi, i) => {
            const Icon = kpi.icon;
            return (
              <div
                key={kpi.label}
                className="surface-glass animate-rise px-5 py-5"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Icon className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wider">{kpi.label}</span>
                </div>
                <div className="mt-3 font-display text-2xl font-bold tracking-tight">{kpi.value}</div>
                <p className="mt-1 text-xs text-muted-foreground">{kpi.sub}</p>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Gateway — the live operational centerpiece */}
          <section className="surface-glass edge-light flex flex-col rounded-2xl border p-6 lg:col-span-2">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display text-base font-bold tracking-tight">Gateway</h2>
                <p className="text-sm text-muted-foreground">실시간 엔드포인트 및 접근 제어</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                <span className="live-dot h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" />
                online
              </span>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">Gateway ID</dt>
                <dd className="mt-0.5 truncate font-mono text-xs text-foreground">{GATEWAY_ID || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">Endpoint</dt>
                <dd className="mt-0.5 truncate font-mono text-xs text-foreground">{GATEWAY_URL || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">Protocol</dt>
                <dd className="mt-0.5 truncate font-mono text-xs text-foreground">{overview?.protocolType || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">Authorizer</dt>
                <dd className="mt-0.5 truncate font-mono text-xs text-foreground">{overview?.authorizerType || '—'}</dd>
              </div>
            </div>

            <Link
              href="/observability"
              className="mt-auto inline-flex items-center gap-2 pt-6 text-sm font-semibold text-primary transition-colors hover:text-primary/80"
            >
              메트릭 보기
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </section>

          {/* Configuration status — setup-time concern, kept as a compact side panel */}
          <section className="surface-glass edge-light rounded-2xl border p-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display text-base font-bold tracking-tight">구성</h2>
                <p className="text-sm text-muted-foreground">
                  환경 변수
                </p>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                  allConfigured
                    ? 'border-primary/30 bg-primary/10 text-primary'
                    : 'border-destructive/30 bg-destructive/10 text-destructive'
                }`}
              >
                {allConfigured ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5" />
                )}
                {configured}/{ENV_CHECKS.length} 설정됨
              </span>
            </div>

            <div className="mt-5 divide-y divide-border/70 overflow-hidden rounded-xl border">
              {ENV_CHECKS.map((c) => {
                const ok = Boolean(c.value);
                return (
                  <div
                    key={c.key}
                    className="flex items-center justify-between gap-4 bg-muted/30 px-4 py-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {ok ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                      )}
                      <code className="truncate font-mono text-xs text-foreground">{c.key}</code>
                    </div>
                    <span
                      className={`shrink-0 font-mono text-xs ${
                        ok ? 'text-muted-foreground' : 'text-destructive'
                      }`}
                    >
                      {maskValue(c.value)}
                    </span>
                  </div>
                );
              })}
            </div>

            {!allConfigured && (
              <p className="mt-4 text-xs text-muted-foreground">
                누락된 값을{' '}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono">.env.local</code> 에
                설정한 뒤 개발 서버를 다시 시작하세요.
              </p>
            )}
          </section>
        </div>

        {/* Access — allowed clients + live target roster (folded in from the old /access page) */}
        <section className="surface-glass edge-light rounded-2xl border p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <div>
                <h2 className="font-display text-base font-bold tracking-tight">Access</h2>
                <p className="text-sm text-muted-foreground">허용된 클라이언트와 실시간 타깃</p>
              </div>
            </div>
            {accessLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          {accessError && (
            <p className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {accessError}
            </p>
          )}

          {overview ? (
            <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  허용된 클라이언트 ({overview.allowedClients.length})
                </p>
                <ul className="mt-2 space-y-1">
                  {overview.allowedClients.map((c) => (
                    <li key={c} className="truncate rounded-md bg-muted/40 px-2.5 py-1.5 font-mono text-xs">
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  타깃 ({overview.targets.length})
                </p>
                <div className="mt-2 space-y-1">
                  {overview.targets.map((t) => (
                    <div
                      key={t.targetId}
                      className="flex items-center justify-between gap-3 rounded-md border px-2.5 py-1.5"
                    >
                      <span className="truncate text-sm font-medium">{t.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{t.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            !accessLoading && !accessError && (
              <p className="mt-4 text-sm text-muted-foreground">게이트웨이 데이터가 없습니다.</p>
            )
          )}

          <div className="mt-5 flex gap-3 rounded-xl border border-blue-500/40 bg-blue-500/5 px-3.5 py-3 text-sm">
            <Info className="h-5 w-5 shrink-0 text-blue-500" />
            <p className="text-muted-foreground">
              이 게이트웨이는 <span className="font-mono">CUSTOM_JWT</span> 인증자를 사용합니다. 접근
              권한은 위의 <strong className="text-foreground">허용된 클라이언트 목록</strong>으로
              관리되며 — 해당 Cognito 클라이언트만 게이트웨이를 호출할 수 있습니다.
            </p>
          </div>
        </section>

        {/* Module launcher */}
        <section>
          <div className="mb-4 flex items-end justify-between">
            <h2 className="font-display text-base font-bold tracking-tight">모듈</h2>
            <span className="font-mono text-xs text-muted-foreground">
              {NAV_ITEMS.length}개 사용 가능
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {NAV_ITEMS.map((item, i) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{ animationDelay: `${i * 50}ms` }}
                  className="surface-glass edge-light animate-rise group relative overflow-hidden rounded-2xl border p-5 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40"
                >
                  <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-primary/0 blur-3xl transition-all duration-500 group-hover:bg-primary/15" />
                  <div className="flex items-center justify-between">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border bg-muted/50 text-primary transition-colors duration-300 group-hover:border-primary/40 group-hover:bg-primary/10">
                      <Icon className="h-5 w-5" />
                    </span>
                    <ArrowUpRight className="h-5 w-5 text-muted-foreground/50 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                  <h3 className="mt-4 font-display text-base font-bold tracking-tight">{item.label}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{item.hint}</p>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
