import { describe, it, expect } from 'vitest';
import { normalizeUrl, urlShareCounts, computeConsensus } from './eval';

describe('normalizeUrl', () => {
  it('lowercases host, drops hash, trailing slash, and tracking params', () => {
    expect(normalizeUrl('https://Example.com/Path/?utm_source=x&q=1#frag'))
      .toBe('https://example.com/path?q=1');
    expect(normalizeUrl('https://example.com/a/')).toBe('https://example.com/a');
  });

  it('falls back to trimmed lowercase for non-URL strings', () => {
    expect(normalizeUrl('  NotAUrl/  ')).toBe('notaurl');
  });
});

describe('urlShareCounts', () => {
  it('counts each engine at most once per normalized url', () => {
    const counts = urlShareCounts({
      a: ['https://x.com/1', 'https://x.com/1/', 'https://x.com/2'], // dup collapses
      b: ['https://x.com/1'],
    });
    expect(counts.get('https://x.com/1')).toBe(2);
    expect(counts.get('https://x.com/2')).toBe(1);
  });
});

describe('computeConsensus', () => {
  it('returns fraction of an engine\'s urls shared by >=2 engines', () => {
    const scores = computeConsensus({
      a: ['https://x.com/1', 'https://x.com/2'], // 1 shared of 2 => 0.5
      b: ['https://x.com/1', 'https://y.com/9'], // 1 shared of 2 => 0.5
    });
    expect(scores.a).toBeCloseTo(0.5);
    expect(scores.b).toBeCloseTo(0.5);
  });

  it('returns 0 for an engine with no urls', () => {
    expect(computeConsensus({ a: [], b: ['https://x.com/1'] }).a).toBe(0);
  });
});
