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
              'inline-flex items-center gap-2 rounded-md h-9 px-3.5 text-body-sm-medium transition-colors',
              isActive
                ? 'bg-ink text-canvas'
                : 'bg-surface text-body border border-hairline hover:border-hairlineStrong hover:text-ink'
            ].join(' ')}
          >
            <span className="font-medium">{it.label}</span>
            {typeof it.count === 'number' && (
              <span
                className={[
                  'tabular-nums text-caption rounded-full px-2 py-0.5 font-medium',
                  isActive ? 'bg-white/15 text-canvas' : 'bg-surfaceMuted text-muted'
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
