import React, { type ButtonHTMLAttributes } from 'react';

// Cursor geometry — compact 8px-radius CTAs, 40px height, weight 500.
type Variant =
  | 'primary'
  | 'dark'
  | 'secondary'
  | 'on-dark'
  | 'secondary-on-dark'
  | 'ghost'
  | 'link'
  | 'danger';

const base = 'rounded-md h-10 px-[18px] text-button-md font-medium';
const compact = 'rounded-md h-9 px-4 text-button-md font-medium';
const tall = 'rounded-md h-11 px-5 text-button-md font-medium';

const styles: Record<Variant, string> = {
  primary: `${base} bg-primary text-onPrimary hover:bg-primaryStrong active:bg-primaryDeep`,
  dark: `${tall} bg-ink text-canvas hover:bg-inkDeep`,
  secondary: `${base} bg-surface text-ink border border-hairlineStrong hover:border-ink`,
  'on-dark': `${base} bg-canvas text-ink hover:bg-surfaceMuted`,
  'secondary-on-dark': `${base} bg-transparent text-onDark border border-darkOnSurfaceMuted/40 hover:bg-white/10`,
  ghost: `${compact} bg-transparent text-ink hover:bg-surfaceMuted`,
  link: 'bg-transparent text-ink hover:text-primary underline-offset-2 hover:underline px-0 py-0 font-medium',
  danger: `${base} bg-error text-onPrimary hover:opacity-90`
};

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 ${styles[variant]} ${className}`}
    />
  );
}
