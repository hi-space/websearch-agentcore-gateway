import { describe, it, expect } from 'vitest';
import { computeDiversity, computeFreshness } from './quality-metrics';

describe('computeDiversity', () => {
  it('returns unique hostnames over count', () => {
    // 4 urls, 3 distinct hosts → 3/4
    const score = computeDiversity([
      'https://a.com/x',
      'https://a.com/y',
      'https://b.com/z',
      'https://c.com/w',
    ]);
    expect(score).toBeCloseTo(0.75);
  });

  it('treats same host different path as one domain', () => {
    expect(computeDiversity(['https://a.com/1', 'https://a.com/2'])).toBeCloseTo(0.5);
  });

  it('returns null when no usable urls', () => {
    expect(computeDiversity([])).toBeNull();
    expect(computeDiversity(['not a url', ''])).toBeNull();
  });
});

describe('computeFreshness', () => {
  const now = Date.parse('2026-06-20T00:00:00.000Z');

  it('scores recent results high', () => {
    const r = computeFreshness(['2026-06-18T00:00:00Z'], now); // 2 days
    expect(r.score).toBe(1.0);
    expect(r).toMatchObject({ dated: 1, total: 1 });
  });

  it('uses median age across dated results', () => {
    // ages ~ 2d, ~400d → median 201d → <=365 bucket → 0.5
    const r = computeFreshness(['2026-06-18T00:00:00Z', '2025-05-16T00:00:00Z'], now);
    expect(r.score).toBe(0.5);
  });

  it('ignores unparseable dates but counts total', () => {
    const r = computeFreshness(['2 days ago', '2026-06-18T00:00:00Z'], now);
    expect(r.dated).toBe(1);
    expect(r.total).toBe(2);
    expect(r.score).toBe(1.0);
  });

  it('returns null score when nothing is dated', () => {
    const r = computeFreshness([undefined, 'yesterday'], now);
    expect(r).toEqual({ score: null, dated: 0, total: 2 });
  });

  it('buckets old content to zero', () => {
    const r = computeFreshness(['2020-01-01T00:00:00Z'], now); // >3y
    expect(r.score).toBe(0);
  });
});
