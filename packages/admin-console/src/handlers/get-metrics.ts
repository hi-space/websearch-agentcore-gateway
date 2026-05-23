import {
  GetMetricDataCommand,
  type CloudWatchClient
} from '@aws-sdk/client-cloudwatch';

export interface ProviderMetric {
  providerId: string;
  p95LatencyMs?: number;
  errorRate?: number;
}

export async function getMetrics(
  cw: CloudWatchClient,
  providerIds: string[]
): Promise<ProviderMetric[]> {
  const now = new Date();
  const start = new Date(now.getTime() - 60 * 60 * 1000);
  const queries = providerIds.flatMap((p) => [
    {
      Id: `lat_${p}`,
      MetricStat: {
        Metric: { Namespace: 'SearchGateway', MetricName: 'Latency', Dimensions: [{ Name: 'provider', Value: p }] },
        Period: 300,
        Stat: 'p95'
      },
      ReturnData: true
    },
    {
      Id: `err_${p}`,
      MetricStat: {
        Metric: { Namespace: 'SearchGateway', MetricName: 'ErrorRate', Dimensions: [{ Name: 'provider', Value: p }] },
        Period: 300,
        Stat: 'Average'
      },
      ReturnData: true
    }
  ]);
  const out = await cw.send(
    new GetMetricDataCommand({ StartTime: start, EndTime: now, MetricDataQueries: queries })
  );
  return providerIds.map((p) => {
    const lat = out.MetricDataResults?.find((r) => r.Id === `lat_${p}`)?.Values?.[0];
    const err = out.MetricDataResults?.find((r) => r.Id === `err_${p}`)?.Values?.[0];
    const result: ProviderMetric = { providerId: p };
    if (lat !== undefined) result.p95LatencyMs = lat;
    if (err !== undefined) result.errorRate = err;
    return result;
  });
}
