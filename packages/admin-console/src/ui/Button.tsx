import React, { type ButtonHTMLAttributes } from 'react';

// Nike geometry — pill-shaped CTAs at 30px radius, 48px height, weight 500.
// `primary` is the universal black ink pill; `secondary` is the soft-cloud pill;
// `on-dark` / `on-image` are the white pill on dark or photographic surfaces.
type Variant =
  | 'primary'
  | 'dark'
  | 'secondary'
  | 'on-dark'
  | 'on-image'
  | 'secondary-on-dark'
  | 'ghost'
  | 'link'
  | 'danger';

const pill = 'rounded-full h-12 px-8 text-button-md font-medium press-collapse';
const compact = 'rounded-full h-10 px-6 text-button-md font-medium press-collapse';
const tall = 'rounded-full h-12 px-8 text-button-md font-medium press-collapse';

const styles: Record<Variant, string> = {
  primary: `${pill} bg-ink text-onPrimary hover:bg-inkDeep`,
  dark: `${tall} bg-ink text-onPrimary hover:bg-inkDeep`,
  secondary: `${pill} bg-surfaceSoft text-ink hover:bg-surfaceStrong`,
  'on-dark': `${pill} bg-canvas text-ink hover:bg-surfaceSoft`,
  'on-image': `${compact} bg-canvas text-ink hover:bg-surfaceSoft`,
  'secondary-on-dark': `${pill} bg-transparent text-onDark border border-darkOnSurfaceMuted/50 hover:bg-white/10`,
  ghost: `${compact} bg-transparent text-ink hover:bg-surfaceSoft`,
  link: 'bg-transparent text-ink hover:opacity-70 underline underline-offset-4 px-0 py-0 font-medium',
  danger: `${pill} bg-error text-onPrimary hover:bg-saleDeep`
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
