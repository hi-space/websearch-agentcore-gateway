import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { AdminShell } from '../../src/ui/AdminShell';
import { ToastProvider } from '../../src/ui/Toast';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const region = process.env.AWS_REGION ?? 'us-east-1';
  const actor = cookies().get('admin_actor')?.value;

  return (
    <ToastProvider>
      <AdminShell region={region} actor={actor}>
        {children}
      </AdminShell>
    </ToastProvider>
  );
}
