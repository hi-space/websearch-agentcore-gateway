'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar, type Section } from './Sidebar';
import { TopBar } from './TopBar';

const TITLES: Record<Section, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard', subtitle: 'Provider health and request volume across the gateway.' },
  providers: { title: 'Providers', subtitle: 'Enable, configure, and rotate credentials for upstream search providers.' },
  playground: { title: 'Search playground', subtitle: 'Run unified search across all enabled providers and inspect the merged ranking.' },
  audit: { title: 'Audit log', subtitle: 'Every privileged operation is recorded with actor, action, and target.' },
  settings: { title: 'Settings', subtitle: 'Deployment metadata and operator account.' }
};

function deriveSection(pathname: string): Section {
  if (pathname.startsWith('/admin/audit')) return 'audit';
  if (pathname.startsWith('/admin/providers')) return 'providers';
  if (pathname.startsWith('/admin/playground')) return 'playground';
  if (pathname.startsWith('/admin/settings')) return 'settings';
  return 'dashboard';
}

interface AdminShellProps {
  children: ReactNode;
  region?: string | undefined;
  actor?: string | undefined;
}

export function AdminShell({ children, region, actor }: AdminShellProps) {
  const pathname = usePathname() ?? '/admin/dashboard';
  const section = deriveSection(pathname);
  const meta = TITLES[section];

  return (
    <div className="min-h-screen flex bg-canvas">
      <Sidebar active={section} />
      <div className="flex-1 flex flex-col">
        <TopBar title={meta.title} subtitle={meta.subtitle} region={region} actor={actor} />
        <main className="flex-1 p-8 max-w-[1280px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
