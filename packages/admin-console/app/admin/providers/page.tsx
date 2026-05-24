import { adminApi } from '../../../src/lib/api.js';
import { ProviderList } from '../../../src/views/ProviderList.js';

export default async function Page() {
  const rows = await adminApi.listProviders();
  return <ProviderList rows={rows} />;
}
