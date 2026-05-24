import React, { type ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'ghost' | 'danger';

const styles: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primaryPressed',
  ghost: 'bg-transparent text-charcoal hover:bg-surface',
  danger: 'bg-semanticError text-white hover:opacity-90'
};

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`px-4 py-2 rounded-pill text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${styles[variant]} ${className}`}
    />
  );
}
