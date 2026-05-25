import React from 'react';
import Link from 'next/link';

export interface JourneyStep {
  number: string;
  label: string;
  title: string;
  description: string;
  href?: string;
  icon?: React.ReactNode;
}

export function JourneyStepCard({ step }: { step: JourneyStep }) {
  const inner = (
    <div className="rounded-lg border border-hairline bg-surface p-6 lift-on-hover h-full">
      <div className="flex items-center gap-3 mb-5">
        <span className="w-10 h-10 rounded-md bg-surfaceMuted text-ink inline-flex items-center justify-center text-body-sm font-mono">
          {step.number}
        </span>
        <span className="text-caption-uppercase text-muted">{step.label}</span>
      </div>
      <h3 className="text-display-sm text-ink leading-tight">{step.title}</h3>
      <p className="mt-3 text-body-md text-body leading-relaxed">{step.description}</p>
      {step.href && (
        <span className="mt-5 inline-flex items-center gap-1.5 text-body-sm-medium text-ink group">
          Open
          <span className="transition-transform group-hover:translate-x-0.5" aria-hidden="true">
            →
          </span>
        </span>
      )}
    </div>
  );
  return step.href ? (
    <Link href={step.href} className="block focus:outline-none focus:ring-2 focus:ring-ink/20 rounded-lg">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function JourneyPath({ count = 4 }: { count?: number }) {
  return (
    <div className="hidden lg:block relative h-12 w-full" aria-hidden="true">
      <svg className="absolute inset-0 w-full h-full text-hairlineStrong" viewBox="0 0 1000 48" preserveAspectRatio="none">
        <path
          d={Array.from({ length: count - 1 })
            .map((_, i) => {
              const x1 = ((i + 1) * 1000) / count - 60;
              const x2 = ((i + 1) * 1000) / count + 60;
              return `M ${x1} 24 Q ${(x1 + x2) / 2} ${i % 2 === 0 ? 4 : 44} ${x2} 24`;
            })
            .join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="journey-path"
        />
      </svg>
    </div>
  );
}
