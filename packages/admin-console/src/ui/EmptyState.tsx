import React from 'react';

// Nike empty-state — centered ink heading, flat soft-cloud icon tile, mute body.

export function EmptyState({
  title,
  description,
  action
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="text-center py-20 px-6">
      <div className="mx-auto mb-5 w-14 h-14 rounded-none bg-surfaceSoft flex items-center justify-center">
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M4 7h16M4 12h10M4 17h16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            className="text-ink"
          />
        </svg>
      </div>
      <h3 className="text-heading-lg text-ink">{title}</h3>
      {description && <p className="mt-3 text-body-md text-muted max-w-md mx-auto leading-relaxed">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
