import { describe, it, expect } from 'vitest';
import { diffTargets } from '../diff.js';

describe('diffTargets', () => {
  it('reports targets in DDB but not in Gateway', () => {
    const out = diffTargets({ ddb: ['exa', 'you'], gateway: ['exa'] });
    expect(out.missing).toEqual(['you']);
    expect(out.extra).toEqual([]);
  });

  it('reports targets in Gateway but not in DDB', () => {
    const out = diffTargets({ ddb: ['exa'], gateway: ['exa', 'legacy'] });
    expect(out.missing).toEqual([]);
    expect(out.extra).toEqual(['legacy']);
  });

  it('clean state', () => {
    expect(diffTargets({ ddb: ['exa'], gateway: ['exa'] })).toEqual({ missing: [], extra: [] });
  });
});
