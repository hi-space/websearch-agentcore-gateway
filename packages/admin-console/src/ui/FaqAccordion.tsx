'use client';

import React, { useState } from 'react';

export interface FaqItem {
  q: string;
  a: React.ReactNode;
}

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  return (
    <div className="space-y-3">
      {items.map((it, i) => {
        const isOpen = openIdx === i;
        return (
          <div
            key={i}
            className={[
              'rounded-2xl border bg-surface transition-colors',
              isOpen ? 'border-primary/40' : 'border-outline'
            ].join(' ')}
          >
            <button
              onClick={() => setOpenIdx(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="w-full flex items-center justify-between gap-4 text-left px-6 py-5"
            >
              <span className="text-heading-5 text-onBackground leading-snug">{it.q}</span>
              <span
                aria-hidden="true"
                className={[
                  'shrink-0 w-8 h-8 rounded-full inline-flex items-center justify-center text-body-md font-black transition-colors',
                  isOpen ? 'bg-primary text-onPrimary' : 'bg-primarySoft text-primary'
                ].join(' ')}
              >
                {isOpen ? '−' : '+'}
              </span>
            </button>
            {isOpen && (
              <div className="px-6 pb-6 text-body-md text-slate leading-relaxed border-t border-outline pt-4">
                {it.a}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
