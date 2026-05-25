import {
  GetMetricDataCommand,
  type CloudWatchClient
} from '@aws-sdk/client-cloudwatch';

export interface ProviderMetric {
  providerId: string;
  p95LatencyMs?: number;
  errorRate?: number;
  latencySeries?: number[];
  errorSeries?: number[];
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
    const latRow = out.MetricDataResults?.find((r) => r.Id === `lat_${p}`);
    const errRow = out.MetricDataResults?.find((r) => r.Id === `err_${p}`);
    const lat = latRow?.Values?.[0];
    const err = errRow?.Values?.[0];
    const result: ProviderMetric = { providerId: p };
    if (lat !== undefined) result.p95LatencyMs = lat;
    if (err !== undefined) result.errorRate = err;
    if (latRow?.Values && latRow.Values.length > 1) result.latencySeries = [...latRow.Values].reverse();
    if (errRow?.Values && errRow.Values.length > 1) result.errorSeries = [...errRow.Values].reverse();
    return result;
  });
}
