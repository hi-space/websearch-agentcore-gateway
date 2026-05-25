import React from 'react';

export interface DeliverableChip {
  id: string;
  label: string;
  value: React.ReactNode;
  hint?: string;
}

export function DeliverablesPanel({
  eyebrow,
  title,
  description,
  chips
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  chips: DeliverableChip[];
}) {
  return (
    <div className="rounded-lg text-onDark p-8 md:p-10 bg-ink relative overflow-hidden">
      <div className="grid-pattern absolute inset-0 opacity-50 pointer-events-none" aria-hidden="true" />
      <div className="relative">
        {eyebrow && (
          <span className="text-caption-uppercase text-darkOnSurfaceMuted">{eyebrow}</span>
        )}
        <h3 className="mt-3 text-display-lg text-onDark leading-tight">{title}</h3>
        {description && (
          <p className="mt-4 text-body-md text-darkOnSurfaceMuted max-w-2xl leading-relaxed">{description}</p>
        )}

        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-3">
          {chips.map((c) => (
            <div
              key={c.id}
              className="rounded-lg border border-darkOutline/60 bg-white/[0.03] px-4 py-4"
            >
              <div className="text-caption-uppercase text-darkOnSurfaceSubtle">{c.label}</div>
              <div className="mt-2 text-display-sm text-onDark tabular-nums">{c.value}</div>
              {c.hint && <div className="mt-1 text-body-sm text-darkOnSurfaceMuted">{c.hint}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
