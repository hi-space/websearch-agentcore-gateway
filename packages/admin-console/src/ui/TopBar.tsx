import React from 'react';
import { Badge } from './Badge';

interface TopBarProps {
  title: string;
  subtitle?: string | undefined;
  actor?: string | undefined;
  region?: string | undefined;
  actions?: React.ReactNode;
}

export function TopBar({ title, subtitle, actor, region, actions }: TopBarProps) {
  return (
    <header className="bg-canvas border-b border-hairline px-6 py-5 flex items-center justify-between gap-6">
      <div className="min-w-0">
        <h1 className="text-display-sm text-ink leading-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-body-md text-body leading-relaxed">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {region && <Badge tone="neutral">{region}</Badge>}
        {actor && (
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-full bg-surfaceMuted text-ink inline-flex items-center justify-center text-body-sm font-medium">
              {actor.slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden md:inline text-body-sm-medium text-ink">{actor}</span>
          </div>
        )}
        {actions}
      </div>
    </header>
  );
}
