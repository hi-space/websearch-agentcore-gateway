import React, { forwardRef, type InputHTMLAttributes } from 'react';

// Nike search-pill: soft-cloud filled, rounded-md (24px), 40px height, anchored
// next to the primary nav. Focus inverts to canvas + 2px ink border.

export const SearchPill = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => {
    return (
      <div
        className={`inline-flex items-center gap-2.5 h-10 px-4 rounded-md bg-surfaceSoft border border-transparent focus-within:bg-canvas focus-within:border-ink focus-within:ring-2 focus-within:ring-surfaceSoft transition-colors ${className}`}
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
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="text-ink">
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
