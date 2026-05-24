import React from 'react';
import Link from 'next/link';

type Section = 'providers' | 'dashboard' | 'audit' | 'settings';

const items: Array<{ id: Section; label: string; href: string }> = [
  { id: 'providers', label: 'Providers', href: '/admin/providers' },
  { id: 'dashboard', label: 'Dashboard', href: '/admin/dashboard' },
  { id: 'audit', label: 'Audit log', href: '/admin/audit' },
  { id: 'settings', label: 'Settings', href: '/admin/settings' }
];

export function Sidebar({ active }: { active: Section }) {
  return (
    <nav aria-label="Admin sections" className="bg-brandNavy text-white w-56 min-h-screen p-6 flex flex-col gap-1">
      <span className="text-sm font-semibold mb-6 tracking-wide uppercase opacity-80">search-gateway</span>
      {items.map((i) => (
        <Link
          key={i.id}
          href={i.href}
          aria-current={active === i.id ? 'page' : undefined}
          className={`px-3 py-2 rounded-md text-sm ${active === i.id ? 'bg-brandNavyMid' : 'hover:bg-brandNavyMid/60'}`}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
