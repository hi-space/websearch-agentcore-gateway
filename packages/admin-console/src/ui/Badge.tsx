import React, { type HTMLAttributes } from 'react';

type Tone = 'success' | 'warning' | 'error' | 'neutral' | 'purple' | 'pink' | 'orange';
type TagTone = 'tag-purple' | 'tag-orange' | 'tag-green';
export type BadgeTone = Tone | TagTone | 'popular';

const base = 'rounded-full px-2.5 py-1 text-caption-uppercase leading-none';

const styles: Record<BadgeTone, string> = {
  success: `${base} bg-successSoft text-success`,
  warning: `${base} bg-warningSoft text-warning`,
  error: `${base} bg-errorSoft text-error`,
  neutral: `${base} bg-surfaceStrong text-ink`,
  purple: `${base} bg-surfaceStrong text-ink`,
  pink: `${base} bg-errorSoft text-error`,
  orange: `${base} bg-warningSoft text-warning`,
  'tag-purple': `${base} bg-surfaceStrong text-ink`,
  'tag-orange': `${base} bg-warningSoft text-warning`,
  'tag-green': `${base} bg-successSoft text-success`,
  popular: `${base} bg-primary text-onPrimary`
};

export function Badge({
  tone = 'neutral',
  className = '',
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return <span {...props} className={`inline-flex items-center font-semibold ${styles[tone]} ${className}`} />;
}
