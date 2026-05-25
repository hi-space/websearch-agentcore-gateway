import React from 'react';

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
    <div className="text-center py-16 px-6">
      <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-cardTintLavender flex items-center justify-center">
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M4 7h16M4 12h10M4 17h16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            className="text-brandPurple800"
          />
        </svg>
      </div>
      <h3 className="text-heading-5 text-ink">{title}</h3>
      {description && <p className="mt-1 text-body-sm text-steel max-w-sm mx-auto">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
