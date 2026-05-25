import React, { forwardRef, type InputHTMLAttributes } from 'react';

export const SearchPill = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => {
    return (
      <div
        className={`inline-flex items-center gap-2.5 h-11 px-4 rounded-full bg-surface border border-hairline focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15 transition-colors ${className}`}
      >
        <SearchIcon />
        <input
          ref={ref}
          type="search"
          {...props}
          className="bg-transparent outline-none flex-1 text-body-md text-ink placeholder:text-muted"
        />
      </div>
    );
  }
);
SearchPill.displayName = 'SearchPill';

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="text-muted">
      <path
        d="M11 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm-.7 3.3 3.2 3.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
