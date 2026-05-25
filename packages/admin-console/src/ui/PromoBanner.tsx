import React, { type HTMLAttributes } from 'react';

export function PromoBanner({
  className = '',
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={`bg-surfaceMuted text-ink text-body-sm-medium px-6 py-3 border-b border-hairline ${className}`}
    >
      <div className="max-w-[1280px] mx-auto flex items-center justify-center gap-2 text-center">
        {children}
      </div>
    </div>
  );
}
