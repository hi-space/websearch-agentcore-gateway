import React, { type HTMLAttributes } from 'react';

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`bg-canvas rounded-lg shadow-card border border-hairline p-6 ${className}`} />;
}
