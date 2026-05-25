import React from 'react';

// Nike member-benefit / inverse panel — full-bleed ink surface, white headline
// in display-lg, on-image white pill CTAs anchored bottom-left.

export function SupportPanel({
  title,
  description,
  primary,
  secondary
}: {
  title: string;
  description: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
}) {
  return (
    <div className="rounded-none text-onDark p-10 md:p-12 bg-ink relative overflow-hidden">
      <div className="grid-pattern absolute inset-0 opacity-30 pointer-events-none" aria-hidden="true" />
      <div className="relative flex flex-col md:flex-row md:items-end md:justify-between gap-8">
        <div className="max-w-xl">
          <span className="text-caption-sm uppercase tracking-wide text-darkOnSurfaceMuted">Support</span>
          <h3 className="mt-4 font-display text-display-lg text-onDark leading-[0.9]">{title}</h3>
          <p className="mt-5 text-body-md text-darkOnSurfaceMuted leading-relaxed">{description}</p>
        </div>
        <div className="flex flex-wrap gap-3 shrink-0">
          <a
            href={primary.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center h-12 px-8 rounded-full bg-canvas text-ink text-button-md font-medium hover:bg-surfaceSoft transition-colors"
          >
            {primary.label}
          </a>
          {secondary && (
            <a
              href={secondary.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center h-12 px-8 rounded-full border border-darkOnSurfaceMuted/50 text-onDark text-button-md font-medium hover:bg-white/10 transition-colors"
            >
              {secondary.label}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
