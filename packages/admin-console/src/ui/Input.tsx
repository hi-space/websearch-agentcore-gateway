import React, { type InputHTMLAttributes } from 'react';

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`px-3 py-2 rounded-md border border-hairline focus:border-primary focus:outline-none text-sm ${className}`}
    />
  );
}
