import { describe, it, expect } from 'vitest';
import { deriveMetrics, scoreboardBars, type EngineResult } from './metrics';

const results: Record<string, EngineResult> = {
  fast: { results: [{ url: 'https://x.com/1' }, { url: 'https://x.com/2' }], latency_ms: 400 },
  slow: { results: [{ url: 'https://x.com/1' }], latency_ms: 800 },
  broken: { error: 'boom' },
};

describe('deriveMetrics', () => {
  it('derives latency, count, consensus, error flag, and quality when provided', () => {
    const m = deriveMetrics(results, { fast: 9 });
    const fast = m.find((x) => x.engine === 'fast')!;
    expect(fast.latencyMs).toBe(400);
    expect(fast.resultCount).toBe(2);
    expect(fast.consensus).toBeCloseTo(0.5); // x.com/1 shared, x.com/2 not => 1/2
    expect(fast.quality).toBe(9);
    expect(m.find((x) => x.engine === 'broken')!.hasError).toBe(true);
    expect(m.find((x) => x.engine === 'slow')!.quality).toBeNull();
  });
});

describe('scoreboardBars', () => {
  it('latency: fastest engine gets the longest bar and isBest', () => {
    const m = deriveMetrics(results, null);
    const bars = scoreboardBars(m, 'latency');
    const fast = bars.find((b) => b.engine === 'fast')!;
    const slow = bars.find((b) => b.engine === 'slow')!;
    expect(fast.fraction).toBeCloseTo(1);      // min/v = 400/400
    expect(slow.fraction).toBeCloseTo(0.5);    // 400/800
    expect(fast.isBest).toBe(true);
    expect(bars.find((b) => b.engine === 'broken')!.hasError).toBe(true);
  });

  it('count: largest engine gets the longest bar', () => {
    const m = deriveMetrics(results, null);
    const bars = scoreboardBars(m, 'count');
    expect(bars.find((b) => b.engine === 'fast')!.fraction).toBeCloseTo(1); // 2/2
    expect(bars.find((b) => b.engine === 'slow')!.fraction).toBeCloseTo(0.5); // 1/2
  });

  it('errored or null-value engines get fraction 0', () => {
    const m = deriveMetrics(results, null);
    expect(scoreboardBars(m, 'quality').every((b) => b.fraction === 0)).toBe(true); // no quality yet
  });
});
