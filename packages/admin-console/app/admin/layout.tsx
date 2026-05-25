import type { ReactNode } from 'react';
import { headers, cookies } from 'next/headers';
import { Sidebar, type Section } from '../../src/ui/Sidebar';
import { TopBar } from '../../src/ui/TopBar';
import { PromoBanner } from '../../src/ui/PromoBanner';
import { ToastProvider } from '../../src/ui/Toast';

const TITLES: Record<Section, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard', subtitle: 'Provider health and request volume across the gateway.' },
  providers: { title: 'Providers', subtitle: 'Enable, configure, and rotate credentials for upstream search providers.' },
  audit: { title: 'Audit log', subtitle: 'Every privileged operation is recorded with actor, action, and target.' },
  settings: { title: 'Settings', subtitle: 'Deployment metadata and operator account.' }
};

function deriveSection(pathname: string): Section {
  if (pathname.startsWith('/admin/audit')) return 'audit';
  if (pathname.startsWith('/admin/providers')) return 'providers';
  if (pathname.startsWith('/admin/settings')) return 'settings';
  return 'dashboard';
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const h = headers();
  const pathname = h.get('x-invoke-path') ?? h.get('x-pathname') ?? h.get('next-url') ?? '/admin/dashboard';
  const section = deriveSection(pathname);
  const meta = TITLES[section];
  const region = process.env.AWS_REGION ?? 'us-east-1';
  const actor = cookies().get('admin_actor')?.value;

  return (
    <ToastProvider>
      <div className="min-h-screen flex">
        <Sidebar active={section} />
        <div className="flex-1 flex flex-col">
          <PromoBanner>
            <span className="text-charcoal">
              <span className="font-semibold">v1.0 walking skeleton</span> — connector framework, RBAC, audit, and step-up MFA are live.
            </span>
          </PromoBanner>
          <TopBar title={meta.title} subtitle={meta.subtitle} region={region} actor={actor} />
          <main className="flex-1 p-8 max-w-[1280px] w-full mx-auto">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
