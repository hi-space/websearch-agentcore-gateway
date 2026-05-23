import { describe, it, expect } from 'vitest';
import { mergeRRF } from '../rrf.js';

describe('mergeRRF', () => {
  it('merges by URL with k=60', () => {
    const a = [{ title: 'A', url: 'u1', snippet: '', provider: 'exa', rank: 1 }];
    const b = [{ title: 'A', url: 'u1', snippet: '', provider: 'tavily', rank: 1 }];
    const out = mergeRRF([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe('u1');
    // 1/(60+1) + 1/(60+1) ≈ 0.0328
    expect(out[0].score).toBeCloseTo(2 / 61, 5);
  });

  it('preserves unique URLs', () => {
    const a = [{ title: 'A', url: 'u1', snippet: '', provider: 'exa', rank: 1 }];
    const b = [{ title: 'B', url: 'u2', snippet: '', provider: 'tavily', rank: 1 }];
    expect(mergeRRF([a, b])).toHaveLength(2);
  });

  it('respects topK', () => {
    const a = Array.from({ length: 5 }, (_, i) => ({
      title: `t${i}`,
      url: `u${i}`,
      snippet: '',
      provider: 'exa',
      rank: i + 1
    }));
    expect(mergeRRF([a], { topK: 3 })).toHaveLength(3);
  });
});
