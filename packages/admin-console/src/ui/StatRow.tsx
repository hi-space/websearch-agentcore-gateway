import React from 'react';

export interface StatItem {
  label: string;
  value: React.ReactNode;
  hint?: string;
}

export function StatRow({ items }: { items: StatItem[] }) {
  return (
    <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {items.map((it, i) => (
        <div
          key={i}
          className="rounded-lg border border-hairline bg-surface px-6 py-5 flex flex-col gap-1.5"
        >
          <span className="text-label-sm uppercase tracking-wider text-muted">{it.label}</span>
          <span className="text-card-title text-ink tabular-nums">{it.value}</span>
          {it.hint && <span className="text-body-sm text-body">{it.hint}</span>}
        </div>
      ))}
    </section>
  );
}
