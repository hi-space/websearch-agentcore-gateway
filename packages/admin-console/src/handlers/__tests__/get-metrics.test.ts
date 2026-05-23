import { describe, it, expect, vi } from 'vitest';
import { getMetrics } from '../get-metrics.js';

describe('getMetrics', () => {
  it('returns p95 latency + error rate per provider', async () => {
    const cw = {
      send: vi.fn().mockResolvedValue({
        MetricDataResults: [
          { Id: 'lat_exa', Values: [310] },
          { Id: 'err_exa', Values: [0.012] }
        ]
      })
    };
    const out = await getMetrics(cw as any, ['exa']);
    expect(out).toEqual([{ providerId: 'exa', p95LatencyMs: 310, errorRate: 0.012 }]);
  });
});
