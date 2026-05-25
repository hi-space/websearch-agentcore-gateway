import React, { type HTMLAttributes } from 'react';

// Nike utility-bar — soft-cloud surface, caption-sm text, 36px height,
// always-on top utility strip.

export function PromoBanner({
  className = '',
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={`bg-surfaceSoft text-ink text-caption-sm h-9 flex items-center justify-end px-6 ${className}`}
    >
      <div className="max-w-[1440px] w-full mx-auto flex items-center justify-end gap-4">
        {children}
      </div>
    </div>
  );
}
