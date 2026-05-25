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
  base: 'bg-surface border border-outline rounded-lg p-6 shadow-card',
  feature: 'bg-surface border border-outline rounded-xl p-7 shadow-card',
  panel: 'bg-surface border border-outline rounded-2xl p-8 shadow-card',
  'panel-dark':
    'rounded-2xl p-8 text-onDark shadow-[0_22px_54px_rgba(15,23,42,0.24)] [background:linear-gradient(145deg,#172033_0%,#0f172a_58%,#111827_100%)]',
  'panel-support':
    'rounded-2xl p-8 text-onDark shadow-[0_22px_52px_rgba(37,99,235,0.20)] [background:linear-gradient(135deg,#1e40af_0%,#2563eb_58%,#172033_100%)]',
  'soft-blue': 'bg-surfaceSoft border border-outline rounded-lg p-6',
  'soft-mint': 'bg-surfaceMuted border border-outline rounded-lg p-6',
  lavender: 'bg-surfaceSoft border border-outline rounded-lg p-6',
  mint: 'bg-surfaceMuted border border-outline rounded-lg p-6',
  peach: 'bg-surface border border-outline rounded-lg p-6 shadow-card',
  rose: 'bg-surface border border-outline rounded-lg p-6 shadow-card',
  sky: 'bg-surfaceSoft border border-outline rounded-lg p-6',
  yellow: 'bg-surface border border-outline rounded-lg p-6 shadow-card',
  'yellow-bold': 'bg-surface border border-outline rounded-lg p-6 shadow-card',
  cream: 'bg-surface border border-outline rounded-lg p-6 shadow-card'
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
        <h2 className="text-card-title text-onBackground leading-tight">{title}</h2>
        {subtitle && <p className="mt-1.5 text-body-md text-slate leading-relaxed">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
