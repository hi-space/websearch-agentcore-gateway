'use client';

import React, { useEffect, useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import type { ProviderRow } from '../lib/api';

interface Api {
  updateProvider: (id: string, body: { enabled: boolean; quota: { rpm: number; daily: number }; timeoutMs: number }) => Promise<ProviderRow>;
  putSecret: (id: string, value: string) => Promise<{ providerId: string; versionId: string }>;
  revealSecret: (id: string) => Promise<{ providerId: string; value: string }>;
  testProvider: (id: string) => Promise<{ ok: boolean; results?: number; error?: string }>;
}

export function ProviderDetail({ initial, api }: { initial: ProviderRow; api: Api }) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [rpm, setRpm] = useState(initial.quota.rpm);
  const [daily, setDaily] = useState(initial.quota.daily);
  const [timeoutMs, setTimeoutMs] = useState(initial.timeoutMs);
  const [newSecret, setNewSecret] = useState('');
  const [revealValue, setRevealValue] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; results?: number; error?: string } | null>(null);

  useEffect(() => () => setRevealValue(''), []);

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <h2 className="text-xl font-semibold mb-4">{initial.providerId}</h2>
        <label className="flex items-center gap-2 mb-4">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled((e.target as HTMLInputElement).checked)} />
          <span>Enabled</span>
        </label>
        <div className="grid grid-cols-3 gap-4">
          <label className="flex flex-col gap-1 text-sm">
            RPM
            <Input type="number" value={rpm} onChange={(e) => setRpm(+e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Daily
            <Input type="number" value={daily} onChange={(e) => setDaily(+e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Timeout (ms)
            <Input type="number" value={timeoutMs} onChange={(e) => setTimeoutMs(+e.target.value)} />
          </label>
        </div>
        <div className="mt-4">
          <Button
            onClick={() => api.updateProvider(initial.providerId, { enabled, quota: { rpm, daily }, timeoutMs })}
          >
            Save
          </Button>
        </div>
      </Card>

      <Card>
        <h3 className="text-lg font-semibold mb-3">Secret</h3>
        <div className="flex gap-2 mb-4">
          <Input type="password" value={newSecret} onChange={(e) => setNewSecret(e.target.value)} placeholder="new value" />
          <Button onClick={() => api.putSecret(initial.providerId, newSecret).then(() => setNewSecret(''))}>Store</Button>
        </div>
        {!confirming && !revealValue && <Button variant="ghost" onClick={() => setConfirming(true)}>Reveal</Button>}
        {confirming && (
          <div className="flex items-center gap-3">
            <span>Are you sure? This will be audited.</span>
            <Button
              variant="danger"
              onClick={() => {
                api.revealSecret(initial.providerId).then((r) => {
                  setRevealValue(r.value);
                  setConfirming(false);
                });
              }}
            >
              Confirm reveal
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
          </div>
        )}
        {revealValue && <Input readOnly value={revealValue} aria-label="revealed secret" />}
      </Card>

      <Card>
        <h3 className="text-lg font-semibold mb-3">Connectivity test</h3>
        <Button onClick={async () => setTestResult(await api.testProvider(initial.providerId))}>Test</Button>
        {testResult && (
          <p className="mt-3 text-sm">
            {testResult.ok ? `OK — ${testResult.results} results` : `FAIL — ${testResult.error}`}
          </p>
        )}
      </Card>
    </div>
  );
}
