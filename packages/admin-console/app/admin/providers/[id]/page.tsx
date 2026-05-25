import { adminApi } from '../../../../src/lib/api';
import { ProviderDetail } from '../../../../src/views/ProviderDetail';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: { id: string } }) {
  const rows = await adminApi.listProviders();
  const initial = rows.find((r) => r.providerId === params.id);
  if (!initial) return <p className="text-body-md text-charcoal">Not found.</p>;
  const { metrics } = await adminApi.metrics([params.id]);
  const metric = metrics[0];
  return <ProviderDetail initial={initial} metric={metric} />;
}
