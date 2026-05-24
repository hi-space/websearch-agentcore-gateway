import { adminApi } from '../../../src/lib/api.js';
import { Dashboard } from '../../../src/views/Dashboard.js';

export default async function Page() {
  const providers = await adminApi.listProviders();
  const ids = providers.filter((p) => p.enabled).map((p) => p.providerId);
  const { metrics } = await adminApi.metrics(ids);
  return <Dashboard metrics={metrics} />;
}
