import React from 'react';
import { Card } from '../ui/Card';

interface Metric {
  providerId: string;
  p95LatencyMs?: number;
  errorRate?: number;
}

export function Dashboard({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
      {metrics.map((m) => (
        <Card key={m.providerId}>
          <div className="text-sm text-slate">{m.providerId}</div>
          <div className="mt-2 text-3xl font-semibold">
            {m.p95LatencyMs ? `${m.p95LatencyMs} ms` : '—'}
          </div>
          <div className="mt-1 text-xs text-slate">p95 latency · last hour</div>
          <div className="mt-3 text-sm">
            {m.errorRate !== undefined ? `${(m.errorRate * 100).toFixed(2)} % errors` : 'no error rate yet'}
          </div>
        </Card>
      ))}
    </div>
  );
}
