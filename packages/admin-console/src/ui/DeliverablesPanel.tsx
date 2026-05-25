import React from 'react';

// Nike inverse panel — full-bleed ink with display-lg headline; chip values
// stack as flat tiles with darkOutline hairlines.

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
    <div className="rounded-none text-onDark p-10 md:p-12 bg-ink relative overflow-hidden">
      <div className="grid-pattern absolute inset-0 opacity-30 pointer-events-none" aria-hidden="true" />
      <div className="relative">
        {eyebrow && (
          <span className="text-caption-sm uppercase tracking-wide text-darkOnSurfaceMuted">{eyebrow}</span>
        )}
        <h3 className="mt-4 font-display text-display-lg text-onDark leading-[0.9]">{title}</h3>
        {description && (
          <p className="mt-5 text-body-md text-darkOnSurfaceMuted max-w-2xl leading-relaxed">{description}</p>
        )}

        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-2">
          {chips.map((c) => (
            <div
              key={c.id}
              className="rounded-none border border-darkOutline bg-white/[0.03] px-5 py-5"
            >
              <div className="text-caption-sm uppercase tracking-wide text-darkOnSurfaceSubtle">{c.label}</div>
              <div className="mt-2 text-heading-lg text-onDark tabular-nums">{c.value}</div>
              {c.hint && <div className="mt-1 text-body-sm text-darkOnSurfaceMuted">{c.hint}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
