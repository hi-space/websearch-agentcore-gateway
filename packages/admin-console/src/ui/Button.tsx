import React, { type ButtonHTMLAttributes } from 'react';

// Notion's geometry is rectangular-sober — buttons use rounded-md (8px), NOT pills.
type Variant =
  | 'primary'
  | 'dark'
  | 'secondary'
  | 'on-dark'
  | 'secondary-on-dark'
  | 'ghost'
  | 'link'
  | 'danger';

const styles: Record<Variant, string> = {
  primary: 'bg-primary text-onPrimary hover:bg-primaryPressed active:bg-primaryDeep rounded-md px-[18px] py-[10px]',
  dark: 'bg-inkDeep text-onDark hover:opacity-90 rounded-md px-[18px] py-[10px]',
  secondary: 'bg-transparent text-ink border border-hairlineStrong hover:bg-surface rounded-md px-[18px] py-[10px]',
  'on-dark': 'bg-onDark text-ink hover:opacity-90 rounded-md px-[18px] py-[10px]',
  'secondary-on-dark':
    'bg-transparent text-onDark border border-onDarkMuted hover:bg-white/10 rounded-md px-[18px] py-[10px]',
  ghost: 'bg-transparent text-ink hover:bg-surface rounded-sm px-3 py-2',
  link: 'bg-transparent text-linkBlue hover:text-linkBluePressed underline-offset-2 hover:underline px-0 py-0',
  danger: 'bg-semanticError text-onPrimary hover:opacity-90 rounded-md px-[18px] py-[10px]'
};

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`text-button-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 ${styles[variant]} ${className}`}
    />
  );
}
