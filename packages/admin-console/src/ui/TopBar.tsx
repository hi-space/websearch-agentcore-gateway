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
    <header className="bg-canvas border-b border-hairline px-8 py-5 flex items-center justify-between gap-6">
      <div className="min-w-0">
        <h1 className="text-heading-4 text-ink leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-body-sm text-steel leading-snug">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {region && <Badge tone="neutral">{region}</Badge>}
        {actor && (
          <div className="flex items-center gap-2.5 text-body-sm">
            <span className="w-7 h-7 rounded-full bg-primarySoft text-primary inline-flex items-center justify-center text-caption-bold">
              {actor.slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden md:inline text-ink">{actor}</span>
          </div>
        )}
        {actions}
      </div>
    </header>
  );
}
