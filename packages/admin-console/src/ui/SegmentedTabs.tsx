import React from 'react';

// Nike sub-nav tabs — body-strong text on canvas, active gets a 2px ink underline.

export interface SegmentedTabItem<T extends string> {
  id: T;
  label: string;
}

export function SegmentedTabs<T extends string>({
  items,
  active,
  onChange,
  ariaLabel
}: {
  items: SegmentedTabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex gap-8 border-b border-hairline">
      {items.map((it) => {
        const isActive = it.id === active;
        return (
          <button
            key={it.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(it.id)}
            className={[
              'pb-4 -mb-px text-body-strong transition-colors',
              isActive
                ? 'text-ink border-b-2 border-ink'
                : 'text-charcoal border-b-2 border-transparent hover:text-ink'
            ].join(' ')}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
