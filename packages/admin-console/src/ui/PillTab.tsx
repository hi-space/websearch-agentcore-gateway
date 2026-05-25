import React from 'react';

export interface PillTabItem<T extends string> {
  id: T;
  label: string;
  count?: number;
}

export function PillTabs<T extends string>({
  items,
  active,
  onChange,
  ariaLabel
}: {
  items: PillTabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="inline-flex flex-wrap gap-1 rounded-md bg-surface border border-hairline p-1">
      {items.map((it) => {
        const isActive = it.id === active;
        return (
          <button
            key={it.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(it.id)}
            className={[
              'inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-body-sm-medium transition-colors',
              isActive
                ? 'bg-canvas text-ink shadow-card'
                : 'text-steel hover:text-ink'
            ].join(' ')}
          >
            <span>{it.label}</span>
            {typeof it.count === 'number' && (
              <span
                className={[
                  'tabular-nums text-caption rounded-sm px-1.5 py-0.5',
                  isActive ? 'bg-surface text-steel' : 'bg-hairlineSoft text-stone'
                ].join(' ')}
              >
                {it.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
