import React, { type HTMLAttributes } from 'react';

// Nike badges are pill-shaped, neutral-on-canvas with a 1px hairline outline.
// Sale signaling sticks to inline text in `colors.sale` — never a badge fill.

type Tone = 'success' | 'warning' | 'error' | 'neutral' | 'purple' | 'pink' | 'orange';
type TagTone = 'tag-purple' | 'tag-orange' | 'tag-green';
export type BadgeTone = Tone | TagTone | 'popular';

const base = 'rounded-full px-3 py-1 text-caption-sm leading-none';

const styles: Record<BadgeTone, string> = {
  success: `${base} bg-canvas text-success border border-hairline`,
  warning: `${base} bg-canvas text-sale border border-hairline`,
  error: `${base} bg-canvas text-error border border-hairline`,
  neutral: `${base} bg-canvas text-ink border border-hairline`,
  purple: `${base} bg-canvas text-ink border border-hairline`,
  pink: `${base} bg-canvas text-ink border border-hairline`,
  orange: `${base} bg-canvas text-sale border border-hairline`,
  'tag-purple': `${base} bg-canvas text-ink border border-hairline`,
  'tag-orange': `${base} bg-canvas text-sale border border-hairline`,
  'tag-green': `${base} bg-canvas text-success border border-hairline`,
  popular: `${base} bg-ink text-onPrimary`
};

export function Badge({
  tone = 'neutral',
  className = '',
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return <span {...props} className={`inline-flex items-center font-medium ${styles[tone]} ${className}`} />;
}
