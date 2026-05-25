import React from 'react';
import { Badge } from './Badge';

// Nike primary-nav strip — canvas surface, body-strong title, hairline-soft
// inset bottom, region/actor cluster on the right.

interface TopBarProps {
  title: string;
  subtitle?: string | undefined;
  actor?: string | undefined;
  region?: string | undefined;
  actions?: React.ReactNode;
}

export function TopBar({ title, subtitle, actor, region, actions }: TopBarProps) {
  return (
    <header
      className="bg-canvas px-8 py-6 flex items-center justify-between gap-6"
      style={{ boxShadow: 'inset 0 -1px 0 #f5f5f5' }}
    >
      <div className="min-w-0">
        <h1 className="text-display-lg text-ink leading-tight uppercase tracking-tight">{title}</h1>
        {subtitle && <p className="mt-2 text-body-md text-muted leading-relaxed">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {region && <Badge tone="neutral">{region}</Badge>}
        {actor && (
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-full bg-surfaceSoft text-ink inline-flex items-center justify-center text-button-sm font-medium">
              {actor.slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden md:inline text-body-strong text-ink">{actor}</span>
          </div>
        )}
        {actions}
      </div>
    </header>
  );
}
