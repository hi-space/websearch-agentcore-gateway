import React from 'react';
import Link from 'next/link';

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
      className="bg-surface border-r border-outline w-64 min-h-screen px-4 py-6 flex flex-col"
    >
      <Link href="/admin/dashboard" className="flex items-center gap-3 px-2 mb-10">
        <span className="w-9 h-9 rounded-xl bg-primary inline-flex items-center justify-center text-onPrimary font-black text-body-md shadow-card">
          S
        </span>
        <span className="text-card-title text-onBackground tracking-tight">search-gateway</span>
      </Link>

      <div className="text-label-sm uppercase tracking-wider text-stone px-3 pb-3">Workspace</div>

      <div className="flex flex-col gap-1">
        {items.map((it) => {
          const isActive = active === it.id;
          return (
            <Link
              key={it.id}
              href={it.href}
              aria-current={isActive ? 'page' : undefined}
              className={[
                'flex items-center gap-3 px-3 py-2.5 rounded-full text-body-md font-bold transition-colors',
                isActive
                  ? 'bg-primarySoft text-primaryStrong'
                  : 'text-slate hover:text-onBackground hover:bg-background'
              ].join(' ')}
            >
              <span className={['w-5 h-5 inline-flex items-center justify-center', isActive ? 'text-primary' : 'text-stone'].join(' ')}>
                {it.icon}
              </span>
              <span>{it.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="mt-auto px-1 pt-10">
        <div className="rounded-2xl p-5 text-onDark shadow-card [background:linear-gradient(135deg,#1e40af_0%,#2563eb_58%,#172033_100%)]">
          <p className="text-label-sm uppercase tracking-wider text-darkOnSurfaceMuted">On-call</p>
          <p className="mt-2 text-card-title text-onDark leading-tight">Need help?</p>
          <p className="mt-2 text-body-sm text-darkOnSurfaceMuted leading-relaxed">
            Open the ops runbook for incident playbooks and escalation paths.
          </p>
          <a
            className="mt-3 inline-flex items-center gap-1.5 text-body-sm-medium text-onDark hover:gap-2 transition-all"
            href="https://github.com/"
            target="_blank"
            rel="noreferrer"
          >
            Open runbook <span aria-hidden="true">→</span>
          </a>
        </div>
      </div>
    </nav>
  );
}

function DashboardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2" y="2" width="5" height="6" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="9" y="2" width="5" height="3" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="2" y="10" width="5" height="4" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="9" y="7" width="5" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
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
