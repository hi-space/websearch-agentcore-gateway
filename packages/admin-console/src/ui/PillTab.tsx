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
    <div role="tablist" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {items.map((it) => {
        const isActive = it.id === active;
        return (
          <button
            key={it.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(it.id)}
            className={[
              'inline-flex items-center gap-2 rounded-full h-9 px-4 text-body-sm-medium transition-colors',
              isActive
                ? 'bg-primary text-onPrimary'
                : 'bg-surface text-slate border border-outline hover:border-primary hover:text-primary'
            ].join(' ')}
          >
            <span className="font-bold">{it.label}</span>
            {typeof it.count === 'number' && (
              <span
                className={[
                  'tabular-nums text-caption rounded-full px-2 py-0.5 font-bold',
                  isActive ? 'bg-white/20 text-onPrimary' : 'bg-background text-stone'
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
