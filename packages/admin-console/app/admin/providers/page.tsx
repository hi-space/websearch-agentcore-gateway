import { adminApi } from '../../../src/lib/api';
import { ProviderList } from '../../../src/views/ProviderList';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const rows = await adminApi.listProviders();
  return <ProviderList rows={rows} />;
}
