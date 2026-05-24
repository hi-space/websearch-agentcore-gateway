import { adminApi } from '../../../../src/lib/api.js';
import { ProviderDetail } from '../../../../src/views/ProviderDetail.js';

export default async function Page({ params }: { params: { id: string } }) {
  const rows = await adminApi.listProviders();
  const initial = rows.find((r) => r.providerId === params.id);
  if (!initial) return <p>Not found</p>;
  return <ProviderDetail initial={initial} api={adminApi} />;
}
