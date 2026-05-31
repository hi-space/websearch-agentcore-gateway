'use client';

import { type EngineMetrics } from '@/lib/metrics';
import { humanizeLatency } from '@/lib/eval';

export function EngineMetricCard({
  m,
  selected,
  onSelect,
}: {
  m: EngineMetrics;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-md border p-2.5 text-left transition ${
        selected ? 'border-primary' : 'border-border hover:border-muted-foreground/40'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium capitalize">{m.engine}</span>
        {m.quality !== null && (
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
            Q {m.quality.toFixed(1)}
          </span>
        )}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {m.hasError ? (
          <span className="text-destructive">오류</span>
        ) : (
          <>
            {m.latencyMs !== null ? humanizeLatency(m.latencyMs) : '—'} · 합의{' '}
            {Math.round(m.consensus * 100)}% · {m.resultCount}건
          </>
        )}
      </div>
    </button>
  );
}
