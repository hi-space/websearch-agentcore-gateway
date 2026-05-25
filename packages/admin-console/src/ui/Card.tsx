import React, { type HTMLAttributes } from 'react';

export type CardVariant =
  | 'base'
  | 'feature'
  | 'peach'
  | 'rose'
  | 'mint'
  | 'lavender'
  | 'sky'
  | 'yellow'
  | 'yellow-bold'
  | 'cream';

const variantStyle: Record<CardVariant, string> = {
  base: 'bg-canvas border border-hairline rounded-lg p-6',
  feature: 'bg-canvas border border-hairline rounded-lg p-8',
  peach: 'bg-cardTintPeach text-charcoal rounded-lg p-8',
  rose: 'bg-cardTintRose text-charcoal rounded-lg p-8',
  mint: 'bg-cardTintMint text-charcoal rounded-lg p-8',
  lavender: 'bg-cardTintLavender text-charcoal rounded-lg p-8',
  sky: 'bg-cardTintSky text-charcoal rounded-lg p-8',
  yellow: 'bg-cardTintYellow text-charcoal rounded-lg p-8',
  'yellow-bold': 'bg-cardTintYellowBold text-charcoal rounded-lg p-8',
  cream: 'bg-cardTintCream text-charcoal rounded-lg p-8'
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
        <h2 className="text-heading-5 text-ink leading-tight tracking-tight">{title}</h2>
        {subtitle && <p className="mt-1 text-body-sm text-steel leading-snug">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
