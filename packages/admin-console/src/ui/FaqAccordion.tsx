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
              'rounded-lg border bg-surface transition-colors',
              isOpen ? 'border-hairlineStrong' : 'border-hairline'
            ].join(' ')}
          >
            <button
              onClick={() => setOpenIdx(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="w-full flex items-center justify-between gap-4 text-left px-6 py-5"
            >
              <span className="text-title-md text-ink leading-snug">{it.q}</span>
              <span
                aria-hidden="true"
                className={[
                  'shrink-0 w-7 h-7 rounded-full inline-flex items-center justify-center text-body-md font-medium transition-colors',
                  isOpen ? 'bg-ink text-canvas' : 'bg-surfaceMuted text-ink'
                ].join(' ')}
              >
                {isOpen ? '−' : '+'}
              </span>
            </button>
            {isOpen && (
              <div className="px-6 pb-6 text-body-md text-body leading-relaxed border-t border-hairline pt-5">
                {it.a}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
