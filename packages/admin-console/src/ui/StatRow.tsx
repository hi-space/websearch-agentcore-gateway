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
          className="rounded-lg border border-hairline bg-canvas px-5 py-4 flex flex-col gap-1"
        >
          <span className="text-caption text-steel">{it.label}</span>
          <span className="text-heading-4 text-ink leading-tight tabular-nums">{it.value}</span>
          {it.hint && <span className="text-caption text-stone">{it.hint}</span>}
        </div>
      ))}
    </section>
  );
}
