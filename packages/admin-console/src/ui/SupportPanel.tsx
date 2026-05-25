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
    <div className="rounded-2xl text-onDark p-8 md:p-10 shadow-[0_22px_52px_rgba(37,99,235,0.20)] [background:linear-gradient(135deg,#1e40af_0%,#2563eb_58%,#172033_100%)] relative overflow-hidden">
      <div className="grid-pattern absolute inset-0 opacity-50 pointer-events-none" aria-hidden="true" />
      <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="max-w-xl">
          <span className="text-label-sm uppercase tracking-wider text-darkOnSurfaceMuted">Support</span>
          <h3 className="mt-2 text-section-title text-onDark leading-tight">{title}</h3>
          <p className="mt-3 text-body-lg text-darkOnSurfaceMuted leading-relaxed">{description}</p>
        </div>
        <div className="flex flex-wrap gap-3 shrink-0">
          <a
            href={primary.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center h-12 px-5 rounded-full bg-onDark text-primaryStrong text-button-md font-bold hover:bg-surfaceSoft transition-colors"
          >
            {primary.label}
          </a>
          {secondary && (
            <a
              href={secondary.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center h-12 px-5 rounded-full border border-darkOnSurfaceMuted/40 text-onDark text-button-md font-bold hover:bg-white/10 transition-colors"
            >
              {secondary.label}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
