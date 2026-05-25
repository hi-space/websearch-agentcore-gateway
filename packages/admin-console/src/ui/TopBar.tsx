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
    <header className="bg-surface border-b border-outline px-8 py-6 flex items-center justify-between gap-6">
      <div className="min-w-0">
        <h1 className="text-card-title text-onBackground leading-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-body-md text-slate leading-relaxed">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {region && <Badge tone="purple">{region}</Badge>}
        {actor && (
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-full bg-primarySoft text-primaryStrong inline-flex items-center justify-center text-body-md font-black">
              {actor.slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden md:inline text-body-md-medium text-onBackground">{actor}</span>
          </div>
        )}
        {actions}
      </div>
    </header>
  );
}
