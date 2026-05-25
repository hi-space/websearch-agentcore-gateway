import React, { type HTMLAttributes } from 'react';

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

const variantStyle: Record<CardVariant, string> = {
  base: 'bg-surface border border-hairline rounded-lg p-6',
  feature: 'bg-surface border border-hairline rounded-lg p-6',
  panel: 'bg-surface border border-hairline rounded-lg p-6',
  'panel-dark':
    'rounded-lg p-6 text-onDark bg-ink',
  'panel-support':
    'rounded-lg p-6 text-onDark bg-ink',
  'soft-blue': 'bg-surfaceMuted border border-hairline rounded-lg p-6',
  'soft-mint': 'bg-surfaceMuted border border-hairline rounded-lg p-6',
  lavender: 'bg-surfaceMuted border border-hairline rounded-lg p-6',
  mint: 'bg-surfaceMuted border border-hairline rounded-lg p-6',
  peach: 'bg-surface border border-hairline rounded-lg p-6',
  rose: 'bg-surface border border-hairline rounded-lg p-6',
  sky: 'bg-surfaceMuted border border-hairline rounded-lg p-6',
  yellow: 'bg-surface border border-hairline rounded-lg p-6',
  'yellow-bold': 'bg-surface border border-hairline rounded-lg p-6',
  cream: 'bg-canvasSoft border border-hairline rounded-lg p-6'
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
        {subtitle && <p className="mt-1.5 text-body-md text-body leading-relaxed">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
