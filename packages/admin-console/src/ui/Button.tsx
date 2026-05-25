import React, { type ButtonHTMLAttributes } from 'react';

// Galois geometry — pill-shaped CTAs (height 48), heavy weight.
type Variant =
  | 'primary'
  | 'dark'
  | 'secondary'
  | 'on-dark'
  | 'secondary-on-dark'
  | 'ghost'
  | 'link'
  | 'danger';

const pill = 'rounded-full h-12 px-5 text-button-md font-bold';
const compact = 'rounded-full h-10 px-4 text-button-md font-bold';

const styles: Record<Variant, string> = {
  primary: `${pill} bg-primary text-onPrimary hover:bg-primaryStrong active:bg-primaryDeep`,
  dark: `${pill} bg-darkSurface text-onDark hover:bg-darkPanel`,
  secondary: `${pill} bg-transparent text-onBackground border border-outline hover:border-primary hover:text-primary`,
  'on-dark': `${pill} bg-onDark text-onBackground hover:bg-surfaceSoft`,
  'secondary-on-dark': `${pill} bg-transparent text-onDark border border-darkOnSurfaceMuted/50 hover:bg-white/10`,
  ghost: `${compact} bg-transparent text-onBackground hover:bg-surfaceSoft`,
  link: 'bg-transparent text-primary hover:text-primaryStrong underline-offset-2 hover:underline px-0 py-0 font-medium',
  danger: `${pill} bg-error text-onPrimary hover:opacity-90`
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
