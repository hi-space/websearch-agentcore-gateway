import React, { type HTMLAttributes } from 'react';

type Tone = 'success' | 'warning' | 'error' | 'neutral' | 'purple' | 'pink' | 'orange';
type TagTone = 'tag-purple' | 'tag-orange' | 'tag-green';
export type BadgeTone = Tone | TagTone | 'popular';

const base = 'rounded-full px-2.5 py-0.5 text-label-sm uppercase tracking-wider leading-none';

const styles: Record<BadgeTone, string> = {
  success: `${base} bg-successSoft text-success`,
  warning: `${base} bg-warningSoft text-warning`,
  error: `${base} bg-errorSoft text-error`,
  neutral: `${base} bg-background text-slate border border-outline`,
  purple: `${base} bg-primarySoft text-primaryStrong`,
  pink: `${base} bg-errorSoft text-error`,
  orange: `${base} bg-warningSoft text-warning`,
  'tag-purple': `${base} bg-primarySoft text-primaryStrong`,
  'tag-orange': `${base} bg-warningSoft text-warning`,
  'tag-green': `${base} bg-successSoft text-success`,
  popular: `${base} bg-primary text-onPrimary`
};

export function Badge({
  tone = 'neutral',
  className = '',
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return <span {...props} className={`inline-flex items-center font-bold ${styles[tone]} ${className}`} />;
}
