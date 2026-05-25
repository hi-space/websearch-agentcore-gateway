import React from 'react';

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
    <div className="rounded-lg text-onDark p-8 md:p-10 bg-ink relative overflow-hidden">
      <div className="grid-pattern absolute inset-0 opacity-40 pointer-events-none" aria-hidden="true" />
      <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="max-w-xl">
          <span className="text-caption-uppercase text-darkOnSurfaceMuted">Support</span>
          <h3 className="mt-3 text-display-lg text-onDark leading-tight">{title}</h3>
          <p className="mt-4 text-body-md text-darkOnSurfaceMuted leading-relaxed">{description}</p>
        </div>
        <div className="flex flex-wrap gap-3 shrink-0">
          <a
            href={primary.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center h-10 px-[18px] rounded-md bg-primary text-onPrimary text-button-md font-medium hover:bg-primaryStrong transition-colors"
          >
            {primary.label}
          </a>
          {secondary && (
            <a
              href={secondary.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center h-10 px-[18px] rounded-md border border-darkOnSurfaceMuted/40 text-onDark text-button-md font-medium hover:bg-white/10 transition-colors"
            >
              {secondary.label}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
