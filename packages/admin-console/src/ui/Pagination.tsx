import React from 'react';

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
    <nav aria-label="Pagination" className="flex items-center justify-between text-body-sm text-slate">
      <span>
        Page <span className="text-onBackground font-bold">{page}</span> of {pageCount}
      </span>
      <div className="flex gap-2">
        <button
          onClick={prev}
          disabled={page === 1}
          className="px-4 py-1.5 rounded-full border border-outline text-onBackground font-bold disabled:opacity-50 hover:border-primary hover:text-primary transition-colors"
        >
          Prev
        </button>
        <button
          onClick={next}
          disabled={page === pageCount}
          className="px-4 py-1.5 rounded-full border border-outline text-onBackground font-bold disabled:opacity-50 hover:border-primary hover:text-primary transition-colors"
        >
          Next
        </button>
      </div>
    </nav>
  );
}
