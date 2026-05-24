import { adminApi } from '../../../src/lib/api';
import { AuditLog } from '../../../src/views/AuditLog';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const { rows } = await adminApi.auditList();
  return <AuditLog rows={rows} />;
}
