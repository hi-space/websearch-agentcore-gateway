export interface DashboardSpec {
  providers: string[];
  namespace: string;
  region: string;
}

interface Widget {
  type: 'metric';
  properties: { title: string; metrics: unknown[]; region: string; stat: string; period: number };
}

function providerWidget(spec: DashboardSpec, provider: string): Widget {
  return {
    type: 'metric',
    properties: {
      title: provider,
      region: spec.region,
      stat: 'p95',
      period: 60,
      metrics: [
        [spec.namespace, 'Latency', 'provider', provider],
        ['.', 'ErrorRate', '.', '.'],
        ['.', 'Calls', '.', '.']
      ]
    }
  };
}

function unifiedWidget(spec: DashboardSpec): Widget {
  return {
    type: 'metric',
    properties: {
      title: 'search_unified',
      region: spec.region,
      stat: 'p95',
      period: 60,
      metrics: [
        [spec.namespace, 'Latency', 'tool', 'search_unified'],
        ['.', 'FanOutFailures', '.', '.']
      ]
    }
  };
}

function adminWidget(spec: DashboardSpec): Widget {
  return {
    type: 'metric',
    properties: {
      title: 'admin',
      region: spec.region,
      stat: 'p95',
      period: 60,
      metrics: [
        [spec.namespace, 'AdminLatency'],
        ['.', 'AdminErrors'],
        ['.', 'RevealCount']
      ]
    }
  };
}

export function buildDashboardBody(spec: DashboardSpec): string {
  const widgets: Widget[] = [
    ...spec.providers.map((p) => providerWidget(spec, p)),
    unifiedWidget(spec),
    adminWidget(spec)
  ];
  return JSON.stringify({ widgets });
}
