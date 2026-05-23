import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { emitMetric } from '../metrics.js';

describe('emitMetric', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}); });
  afterEach(() => { logSpy.mockRestore(); });

  it('emits an EMF-shaped JSON line', () => {
    emitMetric({
      namespace: 'SearchGateway',
      dimensions: { Provider: 'arxiv', Status: 'Ok' },
      metrics: { Invocations: 1, LatencyMs: 120 }
    });
    expect(logSpy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(logSpy.mock.calls[0]![0] as string);
    expect(parsed._aws.CloudWatchMetrics[0].Namespace).toBe('SearchGateway');
    expect(parsed._aws.CloudWatchMetrics[0].Dimensions).toEqual([['Provider', 'Status']]);
    expect(parsed.Provider).toBe('arxiv');
    expect(parsed.Status).toBe('Ok');
    expect(parsed.Invocations).toBe(1);
    expect(parsed.LatencyMs).toBe(120);
  });
});
