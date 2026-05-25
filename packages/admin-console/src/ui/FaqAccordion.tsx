'use client';

import React, { useState } from 'react';

export interface FaqItem {
  q: string;
  a: React.ReactNode;
}

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  return (
    <div className="divide-y divide-hairline border border-hairline rounded-md bg-canvas">
      {items.map((it, i) => {
        const isOpen = openIdx === i;
        return (
          <div key={i} className="px-6 py-5">
            <button
              onClick={() => setOpenIdx(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="w-full flex items-center justify-between gap-4 text-left text-heading-5 text-ink"
            >
              <span>{it.q}</span>
              <span className={`transition-transform ${isOpen ? 'rotate-45' : ''} text-steel`}>+</span>
            </button>
            {isOpen && <div className="mt-3 text-body-md text-charcoal">{it.a}</div>}
          </div>
        );
      })}
    </div>
  );
}
