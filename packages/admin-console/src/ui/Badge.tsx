import React, { type HTMLAttributes } from 'react';

type Tone = 'success' | 'warning' | 'error' | 'neutral' | 'purple' | 'pink' | 'orange';
type TagTone = 'tag-purple' | 'tag-orange' | 'tag-green';
export type BadgeTone = Tone | TagTone | 'popular';

const base = 'rounded-sm px-2 py-0.5 text-caption-bold border leading-none';

const styles: Record<BadgeTone, string> = {
  success: `${base} bg-cardTintMint/60 text-semanticSuccess border-cardTintMint`,
  warning: `${base} bg-cardTintYellow/60 text-semanticWarning border-cardTintYellowBold/60`,
  error: `${base} bg-cardTintRose/60 text-semanticError border-cardTintRose`,
  neutral: `${base} bg-surface text-slate border-hairline`,
  purple: `${base} bg-primarySoft text-primaryDeep border-primarySoft`,
  pink: `${base} bg-cardTintRose text-brandPinkDeep border-cardTintRose`,
  orange: `${base} bg-cardTintPeach text-brandOrangeDeep border-cardTintPeach`,
  'tag-purple': `${base} bg-primarySoft text-primaryDeep border-primarySoft`,
  'tag-orange': `${base} bg-cardTintPeach text-brandOrangeDeep border-cardTintPeach`,
  'tag-green': `${base} bg-cardTintMint/60 text-semanticSuccess border-cardTintMint`,
  popular: `${base} bg-primary text-onPrimary border-primary`
};

export function Badge({
  tone = 'neutral',
  className = '',
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return <span {...props} className={`inline-flex items-center ${styles[tone]} ${className}`} />;
}
