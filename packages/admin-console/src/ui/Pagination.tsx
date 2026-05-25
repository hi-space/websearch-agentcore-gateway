import React from 'react';

// Nike pagination — pill-shaped prev/next, ink hover.

export function Pagination({
  page,
  pageCount,
  onChange
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  const prev = () => onChange(Math.max(1, page - 1));
  const next = () => onChange(Math.min(pageCount, page + 1));
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between text-body-md text-charcoal">
      <span>
        Page <span className="text-ink font-medium">{page}</span> of {pageCount}
      </span>
      <div className="flex gap-2">
        <button
          onClick={prev}
          disabled={page === 1}
          className="px-5 py-2 rounded-full border border-hairlineStrong text-ink font-medium disabled:opacity-50 hover:bg-ink hover:text-onPrimary transition-colors"
        >
          Prev
        </button>
        <button
          onClick={next}
          disabled={page === pageCount}
          className="px-5 py-2 rounded-full border border-hairlineStrong text-ink font-medium disabled:opacity-50 hover:bg-ink hover:text-onPrimary transition-colors"
        >
          Next
        </button>
      </div>
    </nav>
  );
}
