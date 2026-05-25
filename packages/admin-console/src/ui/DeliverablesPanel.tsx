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
    <div className="rounded-2xl text-onDark p-8 md:p-10 shadow-[0_22px_54px_rgba(15,23,42,0.24)] [background:linear-gradient(145deg,#172033_0%,#0f172a_58%,#111827_100%)] relative overflow-hidden">
      <div className="grid-pattern absolute inset-0 opacity-60 pointer-events-none" aria-hidden="true" />
      <div className="relative">
        {eyebrow && (
          <span className="text-label-sm uppercase tracking-wider text-darkOnSurfaceMuted">{eyebrow}</span>
        )}
        <h3 className="mt-2 text-section-title text-onDark leading-tight">{title}</h3>
        {description && (
          <p className="mt-3 text-body-lg text-darkOnSurfaceMuted max-w-2xl leading-relaxed">{description}</p>
        )}

        <div className="mt-7 grid grid-cols-1 md:grid-cols-3 gap-3">
          {chips.map((c) => (
            <div
              key={c.id}
              className="rounded-2xl border border-darkOutline/60 bg-white/5 px-5 py-4 backdrop-blur-sm"
            >
              <div className="text-label-sm uppercase tracking-wider text-darkOnSurfaceSubtle">{c.label}</div>
              <div className="mt-1.5 text-card-title text-onDark tabular-nums">{c.value}</div>
              {c.hint && <div className="mt-1 text-body-sm text-darkOnSurfaceMuted">{c.hint}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
