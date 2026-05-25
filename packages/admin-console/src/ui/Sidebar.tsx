import React from 'react';
import Link from 'next/link';

// Nike filter-sidebar — flat canvas rail, body-strong section labels, hairline
// dividers, active row gets an ink underline rather than a fill.

export type Section = 'providers' | 'dashboard' | 'playground' | 'audit' | 'settings';

interface NavItem {
  id: Section;
  label: string;
  href: string;
  icon: React.ReactNode;
}

const items: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/admin/dashboard', icon: <DashboardIcon /> },
  { id: 'providers', label: 'Providers', href: '/admin/providers', icon: <ProvidersIcon /> },
  { id: 'playground', label: 'Playground', href: '/admin/playground', icon: <PlaygroundIcon /> },
  { id: 'audit', label: 'Audit log', href: '/admin/audit', icon: <AuditIcon /> },
  { id: 'settings', label: 'Settings', href: '/admin/settings', icon: <SettingsIcon /> }
];

export function Sidebar({ active }: { active: Section }) {
  return (
    <nav
      aria-label="Admin sections"
      className="bg-canvas border-r border-hairline w-60 min-h-screen px-6 py-8 flex flex-col"
    >
      <Link href="/admin/dashboard" className="flex items-center gap-3 mb-12">
        <span className="w-8 h-8 rounded-none bg-ink inline-flex items-center justify-center text-onPrimary font-medium text-button-md">
          S
        </span>
        <span className="font-display text-display-sm text-ink">SEARCH</span>
      </Link>

      <div className="text-caption-sm text-mutedd uppercase tracking-wide mb-3">Workspace</div>

      <div className="flex flex-col">
        {items.map((it) => {
          const isActive = active === it.id;
          return (
            <Link
              key={it.id}
              href={it.href}
              aria-current={isActive ? 'page' : undefined}
              className={[
                'flex items-center gap-3 py-3 text-body-strong transition-colors border-b border-hairline last:border-b-0',
                isActive ? 'text-ink' : 'text-charcoal hover:text-ink'
              ].join(' ')}
            >
              <span className={['w-5 h-5 inline-flex items-center justify-center', isActive ? 'text-ink' : 'text-muted'].join(' ')}>
                {it.icon}
              </span>
              <span className={isActive ? 'underline underline-offset-[6px] decoration-2' : ''}>{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function DashboardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2" y="2" width="5" height="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="9" y="2" width="5" height="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="2" y="10" width="5" height="4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="9" y="7" width="5" height="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
function ProvidersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 2 2 5l6 3 6-3-6-3Zm-6 6 6 3 6-3M2 11l6 3 6-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
function PlaygroundIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="m10.5 10.5 3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function AuditIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 2h6l2 2v10H4V2Zm2 4h4M6 9h4M6 12h2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 1.5v2m0 9v2M1.5 8h2m9 0h2M3.4 3.4l1.5 1.5m6.2 6.2 1.5 1.5M3.4 12.6l1.5-1.5m6.2-6.2 1.5-1.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
