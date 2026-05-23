export interface MetricInput {
  namespace: string;
  dimensions: Record<string, string>;
  metrics: Record<string, number>;
  unit?: Record<string, 'Count' | 'Milliseconds' | 'Bytes' | 'None'>;
}

export function emitMetric(input: MetricInput): void {
  const dimensionKeys = Object.keys(input.dimensions);
  const metricDefinitions = Object.keys(input.metrics).map((name) => ({
    Name: name,
    Unit: input.unit?.[name] ?? 'None'
  }));
  const payload: Record<string, unknown> = {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: input.namespace,
          Dimensions: [dimensionKeys],
          Metrics: metricDefinitions
        }
      ]
    },
    ...input.dimensions,
    ...input.metrics
  };
  console.log(JSON.stringify(payload));
}
