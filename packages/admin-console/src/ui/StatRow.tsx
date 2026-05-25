import React from 'react';

// Nike stat row — flat tiles on soft-cloud, hairline divider, body-strong value,
// uppercase caption-sm label.

export interface StatItem {
  label: string;
  value: React.ReactNode;
  hint?: string;
}

export function StatRow({ items }: { items: StatItem[] }) {
  return (
    <section className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {items.map((it, i) => (
        <div
          key={i}
          className="rounded-none bg-surfaceSoft px-6 py-6 flex flex-col gap-2"
        >
          <span className="text-caption-sm uppercase tracking-wide text-muted">{it.label}</span>
          <span className="text-heading-lg text-ink tabular-nums">{it.value}</span>
          {it.hint && <span className="text-body-sm text-muted">{it.hint}</span>}
        </div>
      ))}
    </section>
  );
}
