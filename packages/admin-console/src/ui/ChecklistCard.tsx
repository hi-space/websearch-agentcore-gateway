import React from 'react';

// Nike-style checklist — flat soft-cloud surface, ink check dots, body-strong list.

export interface ChecklistCardProps {
  title: string;
  items: string[];
  tone?: 'success' | 'warning';
}

export function ChecklistCard({ title, items, tone = 'success' }: ChecklistCardProps) {
  const dotBg = tone === 'success' ? 'bg-success' : 'bg-sale';

  return (
    <div className="rounded-none border border-hairline bg-canvas p-8">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-caption-sm uppercase tracking-wide text-muted">Checklist</span>
      </div>
      <h3 className="text-heading-lg text-ink leading-tight mb-6">{title}</h3>
      <ul className="space-y-4">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-3 text-body-md text-ink leading-relaxed">
            <span className={`mt-1 w-5 h-5 rounded-full ${dotBg} text-onPrimary inline-flex items-center justify-center shrink-0`}>
              <CheckIcon />
            </span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
      <path d="M2 5.5 4.5 8 9 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
