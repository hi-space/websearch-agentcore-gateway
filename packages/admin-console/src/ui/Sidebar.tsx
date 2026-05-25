import React from 'react';
import Link from 'next/link';

export type Section = 'providers' | 'dashboard' | 'audit' | 'settings';

interface NavItem {
  id: Section;
  label: string;
  href: string;
  icon: React.ReactNode;
}

const items: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/admin/dashboard', icon: <DashboardIcon /> },
  { id: 'providers', label: 'Providers', href: '/admin/providers', icon: <ProvidersIcon /> },
  { id: 'audit', label: 'Audit log', href: '/admin/audit', icon: <AuditIcon /> },
  { id: 'settings', label: 'Settings', href: '/admin/settings', icon: <SettingsIcon /> }
];

export function Sidebar({ active }: { active: Section }) {
  return (
    <nav
      aria-label="Admin sections"
      className="bg-brandNavy text-onDark w-60 min-h-screen px-3 py-6 flex flex-col border-r border-brandNavyHairline/60"
    >
      <Link href="/admin/dashboard" className="flex items-center gap-2.5 px-3 mb-8">
        <span className="w-7 h-7 rounded-md bg-primary inline-flex items-center justify-center text-onPrimary text-body-sm-medium">
          S
        </span>
        <span className="text-body-md-medium text-onDark tracking-tight">search-gateway</span>
      </Link>

      <div className="text-micro-uppercase uppercase text-onDarkSubtle px-3 pb-2 tracking-wider">Workspace</div>

      <div className="flex flex-col gap-0.5">
        {items.map((it) => {
          const isActive = active === it.id;
          return (
            <Link
              key={it.id}
              href={it.href}
              aria-current={isActive ? 'page' : undefined}
              className={[
                'flex items-center gap-3 px-3 py-2 rounded-md text-body-sm-medium transition-colors leading-none',
                isActive
                  ? 'bg-brandNavyMid text-onDark'
                  : 'text-onDarkMuted hover:text-onDark hover:bg-brandNavyMid/70'
              ].join(' ')}
            >
              <span className="w-4 h-4 inline-flex items-center justify-center text-onDarkSubtle">{it.icon}</span>
              <span>{it.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="mt-auto px-3 pt-8">
        <div className="rounded-md border border-brandNavyHairline/60 bg-brandNavyDeep/40 p-4">
          <p className="text-body-sm-medium text-onDark">Need help?</p>
          <p className="mt-1.5 text-body-sm text-onDarkMuted leading-relaxed">
            See the{' '}
            <a
              className="text-onDark underline decoration-onDarkSubtle underline-offset-2 hover:decoration-onDark"
              href="https://github.com/"
              target="_blank"
              rel="noreferrer"
            >
              ops runbook
            </a>{' '}
            for incident playbooks.
          </p>
        </div>
      </div>
    </nav>
  );
}

function DashboardIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <rect x="1" y="1" width="5" height="6" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <rect x="8" y="1" width="5" height="3" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <rect x="1" y="9" width="5" height="4" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <rect x="8" y="6" width="5" height="7" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
function ProvidersIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M7 1 1 4l6 3 6-3-6-3Zm-6 6 6 3 6-3M1 10l6 3 6-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
function AuditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M3 1h6l2 2v10H3V1Zm2 4h4M5 8h4M5 11h2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
function SettingsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="7" cy="7" r="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 1v2m0 8v2M1 7h2m8 0h2M3 3l1.5 1.5M9.5 9.5 11 11M3 11l1.5-1.5M9.5 4.5 11 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
