import { adminApi } from '../../../../src/lib/api';
import { ProviderDetail } from '../../../../src/views/ProviderDetail';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: { id: string } }) {
  const rows = await adminApi.listProviders();
  const initial = rows.find((r) => r.providerId === params.id);
  if (!initial) return <p>Not found</p>;
  return <ProviderDetail initial={initial} api={adminApi} />;
}
