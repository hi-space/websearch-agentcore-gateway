import React from 'react';

// Nike filter-chip — rounded-full 30px, hairline border, fully inverts to ink
// when active. No middle state.

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
              'inline-flex items-center gap-2 rounded-full h-10 px-4 text-button-md font-medium transition-colors',
              isActive
                ? 'bg-ink text-onPrimary'
                : 'bg-canvas text-ink border border-hairlineStrong hover:border-ink'
            ].join(' ')}
          >
            <span>{it.label}</span>
            {typeof it.count === 'number' && (
              <span
                className={[
                  'tabular-nums text-caption-sm rounded-full px-2 py-0.5 font-medium',
                  isActive ? 'bg-white/15 text-onPrimary' : 'bg-surfaceSoft text-muted'
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
