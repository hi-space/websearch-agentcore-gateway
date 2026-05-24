import React, { type HTMLAttributes } from 'react';

type Tone = 'success' | 'warning' | 'error' | 'neutral';

const tones: Record<Tone, string> = {
  success: 'bg-cardTintMint text-charcoal',
  warning: 'bg-cardTintRose text-charcoal',
  error: 'bg-cardTintRose text-semanticError',
  neutral: 'bg-surface text-slate'
};

export function Badge({ tone = 'neutral', className = '', ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span {...props} className={`inline-flex items-center px-2 py-0.5 rounded-pill text-xs font-medium ${tones[tone]} ${className}`} />;
}
