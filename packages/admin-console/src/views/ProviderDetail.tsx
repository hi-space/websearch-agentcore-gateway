'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { SegmentedTabs } from '../ui/SegmentedTabs';
import { Modal } from '../ui/Modal';
import { Sparkline } from '../ui/Sparkline';
import { useToast } from '../ui/Toast';
import { adminApi as defaultApi, type ProviderRow } from '../lib/api';

interface ProviderMetric {
  providerId: string;
  p95LatencyMs?: number;
  errorRate?: number;
  latencySeries?: number[];
  errorSeries?: number[];
}

interface Api {
  updateProvider: (id: string, body: { enabled: boolean; quota: { rpm: number; daily: number }; timeoutMs: number }) => Promise<ProviderRow>;
  putSecret: (id: string, value: string) => Promise<{ providerId: string; versionId: string }>;
  revealSecret: (id: string) => Promise<{ providerId: string; value: string }>;
  testProvider: (id: string) => Promise<{ ok: boolean; results?: number; error?: string }>;
}

interface ProviderDetailProps {
  initial: ProviderRow;
  metric?: ProviderMetric | undefined;
  api?: Api;
}

interface TestHistoryEntry {
  ts: string;
  ok: boolean;
  results?: number;
  error?: string;
}

type Tab = 'overview' | 'configuration' | 'secret' | 'metrics' | 'activity';

export function ProviderDetail({ initial, metric, api = defaultApi }: ProviderDetailProps) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('overview');

  const [enabled, setEnabled] = useState(initial.enabled);
  const [rpm, setRpm] = useState(initial.quota.rpm);
  const [daily, setDaily] = useState(initial.quota.daily);
  const [timeoutMs, setTimeoutMs] = useState(initial.timeoutMs);
  const [savingConfig, setSavingConfig] = useState(false);

  const [newSecret, setNewSecret] = useState('');
  const [storingSecret, setStoringSecret] = useState(false);
  const [revealValue, setRevealValue] = useState('');
  const [revealOpen, setRevealOpen] = useState(false);
  const [revealReason, setRevealReason] = useState('');
  const [revealing, setRevealing] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testHistory, setTestHistory] = useState<TestHistoryEntry[]>([]);

  useEffect(() => () => setRevealValue(''), []);

  const dirty =
    enabled !== initial.enabled ||
    rpm !== initial.quota.rpm ||
    daily !== initial.quota.daily ||
    timeoutMs !== initial.timeoutMs;

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="min-w-0">
            <Link href="/admin/providers" className="text-caption text-linkBlue hover:underline">
              ← Providers
            </Link>
            <div className="mt-1 flex items-center gap-3 flex-wrap">
              <h2 className="text-heading-3 text-ink leading-tight tracking-tight font-mono">{initial.providerId}</h2>
              <Badge tone={initial.enabled ? 'success' : 'neutral'}>
                {initial.enabled ? 'Enabled' : 'Disabled'}
              </Badge>
              <Badge tone={initial.hasSecret ? 'neutral' : 'warning'}>
                {initial.hasSecret ? 'Secret stored' : 'No secret'}
              </Badge>
            </div>
            <dl className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-body-sm">
              <MetaItem label="RPM" value={initial.quota.rpm.toLocaleString()} />
              <MetaItem label="Daily" value={initial.quota.daily.toLocaleString()} />
              <MetaItem label="Timeout" value={`${initial.timeoutMs} ms`} />
            </dl>
          </div>

          <div className="flex flex-col items-stretch md:items-end gap-1.5 shrink-0">
            <Button
              variant="dark"
              disabled={testing}
              onClick={async () => {
                setTesting(true);
                try {
                  const r = await api.testProvider(initial.providerId);
                  setTestHistory((prev) => [{ ts: new Date().toISOString(), ...r }, ...prev].slice(0, 10));
                  toast.push(r.ok ? `OK — ${r.results} results` : `FAIL — ${r.error}`, r.ok ? 'success' : 'error');
                } catch {
                  toast.push('Connectivity test failed', 'error');
                } finally {
                  setTesting(false);
                }
              }}
            >
              {testing ? 'Testing…' : 'Run connectivity test'}
            </Button>
            <span className="text-caption text-steel">Probes a single search via the router.</span>
          </div>
        </div>
      </Card>

      <SegmentedTabs<Tab>
        items={[
          { id: 'overview', label: 'Overview' },
          { id: 'configuration', label: 'Configuration' },
          { id: 'secret', label: 'Secret' },
          { id: 'metrics', label: 'Metrics' },
          { id: 'activity', label: 'Activity' }
        ]}
        active={tab}
        onChange={setTab}
        ariaLabel="Provider sections"
      />

      {tab === 'overview' && <OverviewPanel initial={initial} metric={metric} />}

      {tab === 'configuration' && (
        <Card>
          <CardHeader title="Configuration" subtitle="Live values are applied to the router on save." />
          <label className="flex items-center gap-3 mb-6">
            <input
              type="checkbox"
              className="w-4 h-4 accent-primary"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span className="text-body-md text-ink">Enabled</span>
            <span className="text-caption text-steel">When off, the router rejects requests for this provider.</span>
          </label>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FieldLabel label="Requests per minute" hint="Hard throttle per provider.">
              <Input id="rpm" type="number" value={rpm} onChange={(e) => setRpm(+e.target.value)} />
            </FieldLabel>
            <FieldLabel label="Daily quota" hint="Resets every UTC midnight.">
              <Input id="daily" type="number" value={daily} onChange={(e) => setDaily(+e.target.value)} />
            </FieldLabel>
            <FieldLabel label="Timeout (ms)" hint="Per-call upstream timeout.">
              <Input id="to" type="number" value={timeoutMs} onChange={(e) => setTimeoutMs(+e.target.value)} />
            </FieldLabel>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <Button
              variant="primary"
              disabled={!dirty || savingConfig}
              onClick={async () => {
                setSavingConfig(true);
                try {
                  await api.updateProvider(initial.providerId, {
                    enabled,
                    quota: { rpm, daily },
                    timeoutMs
                  });
                  toast.push('Configuration saved', 'success');
                } catch (e) {
                  toast.push((e as Error).message ?? 'Save failed', 'error');
                } finally {
                  setSavingConfig(false);
                }
              }}
            >
              {savingConfig ? 'Saving…' : 'Save changes'}
            </Button>
            <Button
              variant="ghost"
              disabled={!dirty || savingConfig}
              onClick={() => {
                setEnabled(initial.enabled);
                setRpm(initial.quota.rpm);
                setDaily(initial.quota.daily);
                setTimeoutMs(initial.timeoutMs);
              }}
            >
              Discard
            </Button>
            {dirty && <span className="text-caption text-brandOrangeDeep">Unsaved changes</span>}
          </div>
        </Card>
      )}

      {tab === 'secret' && (
        <Card>
          <CardHeader
            title="API credential"
            subtitle="Stored in AWS Secrets Manager. Reveals require step-up MFA and are rate-limited to 5 per hour."
          />
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
            <Input
              id="new-secret"
              type="password"
              value={newSecret}
              onChange={(e) => setNewSecret(e.target.value)}
              placeholder="Enter new secret value (≥ 8 chars)"
              hint="Stored as a new Secrets Manager version. Old version remains for rollback."
            />
            <Button
              variant="primary"
              disabled={newSecret.length < 8 || storingSecret}
              onClick={async () => {
                setStoringSecret(true);
                try {
                  await api.putSecret(initial.providerId, newSecret);
                  toast.push('Secret stored', 'success');
                  setNewSecret('');
                } catch (e) {
                  toast.push((e as Error).message ?? 'Store failed', 'error');
                } finally {
                  setStoringSecret(false);
                }
              }}
            >
              {storingSecret ? 'Storing…' : 'Store new version'}
            </Button>
          </div>

          <div className="mt-6 flex items-center gap-3 flex-wrap">
            <Button variant="secondary" onClick={() => setRevealOpen(true)}>
              Reveal current secret
            </Button>
            <span className="text-caption text-steel">
              Each reveal is captured in audit log with reason and operator identity.
            </span>
          </div>

          {revealValue && (
            <div className="mt-6">
              <FieldLabel label="Revealed secret (current version)">
                <Input readOnly value={revealValue} aria-label="revealed secret" />
              </FieldLabel>
            </div>
          )}
        </Card>
      )}

      {tab === 'metrics' && <MetricsPanel metric={metric} />}

      {tab === 'activity' && <ActivityPanel history={testHistory} />}

      <Modal
        open={revealOpen}
        onClose={() => setRevealOpen(false)}
        title="Reveal API credential"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRevealOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={revealReason.trim().length < 4 || revealing}
              onClick={async () => {
                setRevealing(true);
                try {
                  const r = await api.revealSecret(initial.providerId);
                  setRevealValue(r.value);
                  setRevealOpen(false);
                  setRevealReason('');
                  toast.push('Secret revealed — recorded in audit log', 'success');
                } catch (e) {
                  toast.push((e as Error).message ?? 'Reveal failed', 'error');
                } finally {
                  setRevealing(false);
                }
              }}
            >
              {revealing ? 'Revealing…' : 'Confirm reveal'}
            </Button>
          </>
        }
      >
        <p className="mb-4">
          This action will surface the current secret value to your screen and emit an audit row attributed to your
          identity. It is rate-limited to 5 per hour.
        </p>
        <FieldLabel label="Reason" hint="At least 4 characters. Visible in the audit row.">
          <Input
            id="reveal-reason"
            placeholder="e.g. rotating shared API key for incident #482"
            value={revealReason}
            onChange={(e) => setRevealReason(e.target.value)}
          />
        </FieldLabel>
      </Modal>
    </div>
  );
}

function FieldLabel({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-body-sm-medium text-ink">
      {label}
      {children}
      {hint && <span className="text-caption text-steel font-normal">{hint}</span>}
    </label>
  );
}

function OverviewPanel({ initial, metric }: { initial: ProviderRow; metric?: ProviderMetric | undefined }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-lg border border-hairline bg-canvas p-5">
        <div className="text-caption text-steel">p95 latency · last hour</div>
        <div className="mt-2 text-heading-3 text-ink leading-none tabular-nums">
          {metric?.p95LatencyMs !== undefined ? `${Math.round(metric.p95LatencyMs)} ms` : '—'}
        </div>
        <div className="mt-4 text-primary">
          <Sparkline values={metric?.latencySeries ?? []} width={240} height={36} ariaLabel="latency trend" />
        </div>
      </div>
      <div className="rounded-lg border border-hairline bg-canvas p-5">
        <div className="text-caption text-steel">error rate · last hour</div>
        <div className="mt-2 text-heading-3 text-ink leading-none tabular-nums">
          {metric?.errorRate !== undefined ? `${(metric.errorRate * 100).toFixed(2)} %` : '—'}
        </div>
        <div className="mt-4 text-primary">
          <Sparkline values={metric?.errorSeries ?? []} width={240} height={36} ariaLabel="error trend" />
        </div>
      </div>
      <Card className="md:col-span-2">
        <CardHeader title="Provider summary" />
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-y-4 text-body-sm">
          <Term label="Provider ID" value={<span className="font-mono text-ink">{initial.providerId}</span>} />
          <Term label="State" value={initial.enabled ? 'Enabled' : 'Disabled'} />
          <Term label="Secret" value={initial.hasSecret ? 'Stored' : 'Not stored'} />
          <Term label="RPM" value={initial.quota.rpm.toLocaleString()} />
          <Term label="Daily quota" value={initial.quota.daily.toLocaleString()} />
          <Term label="Timeout" value={`${initial.timeoutMs} ms`} />
        </dl>
      </Card>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-caption text-steel">{label}</dt>
      <dd className="text-body-sm-medium text-ink tabular-nums">{value}</dd>
    </div>
  );
}

function MetricsPanel({ metric }: { metric?: ProviderMetric | undefined }) {
  if (!metric) {
    return (
      <Card>
        <p className="text-body-md text-steel">Metrics are populated by CloudWatch every 5 minutes.</p>
      </Card>
    );
  }
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader title="Latency (p95)" subtitle="ms · last 60 minutes · 5-minute buckets" />
        <Sparkline
          values={metric.latencySeries ?? (metric.p95LatencyMs !== undefined ? [metric.p95LatencyMs] : [])}
          width={420}
          height={120}
          ariaLabel="latency series"
        />
      </Card>
      <Card>
        <CardHeader title="Error rate" subtitle="% · last 60 minutes · 5-minute buckets" />
        <Sparkline
          values={metric.errorSeries ?? (metric.errorRate !== undefined ? [metric.errorRate] : [])}
          width={420}
          height={120}
          ariaLabel="error series"
        />
      </Card>
    </div>
  );
}

function ActivityPanel({ history }: { history: TestHistoryEntry[] }) {
  if (history.length === 0) {
    return (
      <Card>
        <p className="text-body-md text-steel">
          Run a connectivity test to populate this panel. Each test emits an audit row.
        </p>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader title="Recent connectivity tests" />
      <ul className="divide-y divide-hairline-soft">
        {history.map((h, i) => (
          <li key={i} className="py-3 flex items-center justify-between gap-4">
            <span className="font-mono text-caption text-steel">{h.ts}</span>
            {h.ok ? (
              <span className="text-body-sm text-charcoal">OK — {h.results} results</span>
            ) : (
              <span className="text-body-sm text-semanticError">FAIL — {h.error}</span>
            )}
            <Badge tone={h.ok ? 'success' : 'error'}>{h.ok ? 'OK' : 'FAIL'}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Term({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-caption text-steel">{label}</dt>
      <dd className="text-body-sm-medium text-ink tabular-nums">{value}</dd>
    </div>
  );
}
