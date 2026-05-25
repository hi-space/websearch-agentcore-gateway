import React from 'react';
import Link from 'next/link';
import { Card, CardHeader } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Sparkline } from '../ui/Sparkline';
import { StatRow } from '../ui/StatRow';
import { EmptyState } from '../ui/EmptyState';

export interface DashboardMetric {
  providerId: string;
  p95LatencyMs?: number;
  errorRate?: number;
  latencySeries?: number[];
  errorSeries?: number[];
}

interface ProviderRowLite {
  providerId: string;
  enabled: boolean;
  hasSecret: boolean;
}

function fmtLatency(ms?: number) {
  if (ms === undefined) return '—';
  if (ms < 1) return `${ms.toFixed(2)} ms`;
  return `${Math.round(ms)} ms`;
}

function fmtErrorRate(r?: number) {
  if (r === undefined) return '—';
  return `${(r * 100).toFixed(2)} %`;
}

export function Dashboard({
  metrics,
  providers
}: {
  metrics: DashboardMetric[];
  providers: ProviderRowLite[];
}) {
  const enabled = providers.filter((p) => p.enabled).length;
  const missingSecret = providers.filter((p) => p.enabled && !p.hasSecret).length;
  const avgLatency = (() => {
    const xs = metrics.map((m) => m.p95LatencyMs).filter((v): v is number => v !== undefined);
    if (xs.length === 0) return undefined;
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  })();
  const avgErr = (() => {
    const xs = metrics.map((m) => m.errorRate).filter((v): v is number => v !== undefined);
    if (xs.length === 0) return undefined;
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  })();

  return (
    <div className="space-y-8">
      <StatRow
        items={[
          { label: 'Providers enabled', value: `${enabled} / ${providers.length}`, hint: 'configured & active' },
          { label: 'Avg p95 latency', value: fmtLatency(avgLatency), hint: 'last 60 min' },
          { label: 'Avg error rate', value: fmtErrorRate(avgErr), hint: 'last 60 min' },
          {
            label: 'Secret hygiene',
            value: missingSecret === 0 ? 'OK' : `${missingSecret} missing`,
            hint: missingSecret === 0 ? 'all enabled have secrets' : 'enabled providers without secret'
          }
        ]}
      />

      <Card>
        <CardHeader
          title="Per-provider performance"
          subtitle="p95 latency and error rate over the last hour, sourced from CloudWatch."
          action={
            <Link href="/admin/providers" className="text-linkBlue text-body-sm-medium hover:underline">
              Manage providers →
            </Link>
          }
        />

        {metrics.length === 0 ? (
          <EmptyState
            title="No active providers"
            description="Enable a provider to start receiving metrics here."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {metrics.map((m) => (
              <ProviderMetricTile key={m.providerId} metric={m} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ProviderMetricTile({ metric }: { metric: DashboardMetric }) {
  const errorTone = metric.errorRate === undefined
    ? 'neutral'
    : metric.errorRate > 0.05
      ? 'error'
      : metric.errorRate > 0.01
        ? 'warning'
        : 'success';

  return (
    <Link
      href={`/admin/providers/${metric.providerId}`}
      className="block focus:outline-none focus:ring-2 focus:ring-primary/30 rounded-lg"
      data-testid="provider-metric-tile"
    >
      <div className="rounded-lg border border-hairline bg-canvas p-5 hover:border-hairlineStrong hover:shadow-card transition-colors">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-micro-uppercase uppercase text-steel tracking-wider">{metric.providerId}</div>
            <div className="mt-2 text-heading-3 text-ink leading-none tabular-nums">{fmtLatency(metric.p95LatencyMs)}</div>
            <div className="mt-1 text-caption text-steel">p95 latency · last hour</div>
          </div>
          <Badge tone={errorTone}>{fmtErrorRate(metric.errorRate)}</Badge>
        </div>
        <div className="mt-4 text-primary">
          <Sparkline values={metric.latencySeries ?? []} ariaLabel={`${metric.providerId} latency trend`} />
        </div>
      </div>
    </Link>
  );
}
