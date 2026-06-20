'use client';

import { useState } from 'react';
import { scoreboardBars, type Axis, type EngineMetrics } from '@/lib/metrics';
import { humanizeLatency } from '@/lib/eval';

const AXES: { key: Axis; label: string }[] = [
  { key: 'latency', label: 'Latency' },
  { key: 'consensus', label: '합의도' },
  { key: 'count', label: '결과수' },
];

function formatValue(axis: Axis, value: number | null): string {
  if (value === null) return '—';
  switch (axis) {
    case 'latency': return humanizeLatency(value);
    case 'consensus': return `${Math.round(value * 100)}%`;
    case 'count': return String(value);
  }
}

export function Scoreboard({ metrics }: { metrics: EngineMetrics[] }) {
  const [axis, setAxis] = useState<Axis>('latency');
  const bars = scoreboardBars(metrics, axis);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Scoreboard</span>
        <div className="flex gap-1">
          {AXES.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => setAxis(a.key)}
              className={`rounded-full border px-2.5 py-0.5 text-xs transition ${
                axis === a.key
                  ? 'border-transparent bg-primary/15 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        {bars.map((b) => (
          <div key={b.engine} className="flex items-center gap-2">
            <span className="w-20 truncate text-xs capitalize text-muted-foreground">{b.engine}</span>
            <div className="h-2.5 flex-1 rounded bg-secondary">
              {!b.hasError && (
                <div
                  className="h-2.5 rounded"
                  style={{
                    width: `${Math.round(b.fraction * 100)}%`,
                    background: b.isBest ? '#d4a017' : 'var(--primary, #0d9b87)',
                  }}
                />
              )}
            </div>
            <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">
              {b.hasError ? '오류' : formatValue(axis, b.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
