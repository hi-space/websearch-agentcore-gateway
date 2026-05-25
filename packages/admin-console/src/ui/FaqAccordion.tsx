'use client';

import React, { useState } from 'react';

// Nike faq-row — stacked rows on canvas, hairline divider below each, label
// `heading-md`. No fill, no radius.

export interface FaqItem {
  q: string;
  a: React.ReactNode;
}

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  return (
    <div className="border-t border-hairline">
      {items.map((it, i) => {
        const isOpen = openIdx === i;
        return (
          <div key={i} className="border-b border-hairline">
            <button
              onClick={() => setOpenIdx(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="w-full flex items-center justify-between gap-4 text-left py-6"
            >
              <span className="text-heading-md text-ink leading-snug">{it.q}</span>
              <span aria-hidden="true" className="shrink-0 text-ink text-heading-md leading-none">
                {isOpen ? '−' : '+'}
              </span>
            </button>
            {isOpen && (
              <div className="pb-6 text-body-md text-charcoal leading-relaxed">{it.a}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
