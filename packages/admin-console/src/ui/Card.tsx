import React, { type HTMLAttributes } from 'react';

// Nike cards are flat — no radius, no shadow, no fill (canvas-on-canvas) with
// optional 1px hairline divider. Variants only swap surface/text inversion.

export type CardVariant =
  | 'base'
  | 'feature'
  | 'panel'
  | 'panel-dark'
  | 'panel-support'
  | 'soft-blue'
  | 'soft-mint'
  // legacy variant aliases (kept for compat with older views)
  | 'lavender'
  | 'mint'
  | 'peach'
  | 'rose'
  | 'sky'
  | 'yellow'
  | 'yellow-bold'
  | 'cream';

const surface = 'bg-canvas border border-hairline rounded-none p-6';
const cloud = 'bg-surfaceSoft border border-hairline rounded-none p-6';
const ink = 'rounded-none p-6 text-onDark bg-ink';

const variantStyle: Record<CardVariant, string> = {
  base: surface,
  feature: surface,
  panel: surface,
  'panel-dark': ink,
  'panel-support': ink,
  'soft-blue': cloud,
  'soft-mint': cloud,
  lavender: cloud,
  mint: cloud,
  peach: cloud,
  rose: cloud,
  sky: cloud,
  yellow: cloud,
  'yellow-bold': cloud,
  cream: cloud
};

export function Card({
  variant = 'base',
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: CardVariant }) {
  return <div {...props} className={`${variantStyle[variant]} ${className}`} />;
}

export function CardHeader({
  title,
  subtitle,
  action,
  className = ''
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-start justify-between mb-5 gap-4 ${className}`}>
      <div className="min-w-0">
        <h2 className="text-card-title text-ink leading-tight">{title}</h2>
        {subtitle && <p className="mt-2 text-body-md text-muted leading-relaxed">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
