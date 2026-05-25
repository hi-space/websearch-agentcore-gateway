import React from 'react';

export interface ChecklistCardProps {
  title: string;
  items: string[];
  tone?: 'success' | 'warning';
}

export function ChecklistCard({ title, items, tone = 'success' }: ChecklistCardProps) {
  const toneStyles = tone === 'success'
    ? { dot: 'bg-success text-onPrimary', label: 'text-muted' }
    : { dot: 'bg-warning text-onPrimary', label: 'text-muted' };

  return (
    <div className="rounded-lg border border-hairline bg-surface p-6">
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-caption-uppercase ${toneStyles.label}`}>Checklist</span>
      </div>
      <h3 className="text-display-sm text-ink leading-tight mb-5">{title}</h3>
      <ul className="space-y-3">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-3 text-body-md text-ink leading-relaxed">
            <span className={`mt-1 w-5 h-5 rounded-full ${toneStyles.dot} inline-flex items-center justify-center shrink-0`}>
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
