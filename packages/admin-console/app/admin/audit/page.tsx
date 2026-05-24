import { adminApi } from '../../../src/lib/api.js';
import { AuditLog } from '../../../src/views/AuditLog.js';

export default async function Page() {
  const { rows } = await adminApi.auditList();
  return <AuditLog rows={rows} />;
}
