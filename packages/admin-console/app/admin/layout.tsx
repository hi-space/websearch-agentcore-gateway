import type { ReactNode } from 'react';
import { Sidebar } from '../../src/ui/Sidebar';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* Active section is decided per-page via a server component header below; default highlight = providers */}
      <Sidebar active="providers" />
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
