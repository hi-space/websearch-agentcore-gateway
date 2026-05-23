import { describe, it, expect, vi } from 'vitest';
import { runUnified } from '../unified.js';

describe('runUnified', () => {
  it('fans out to Lambda adapters and Gateway built-ins, merges with RRF', async () => {
    const exa = { search: vi.fn().mockResolvedValue([{ title: 'X', url: 'u1', snippet: '', provider: 'exa', rank: 1 }]) };
    const builtin = vi.fn().mockResolvedValue([{ title: 'X', url: 'u1', snippet: '', provider: 'tavily', rank: 1 }]);
    const out = await runUnified({
      query: 'cats',
      topK: 5,
      lambdaAdapters: { exa: exa as any },
      builtinTools: ['search_tavily'],
      callBuiltin: builtin
    });
    expect(out.results).toHaveLength(1);
    expect(out.results[0].provider).toContain('exa');
    expect(out.results[0].provider).toContain('tavily');
    expect(out.providersUsed.sort()).toEqual(['exa', 'tavily']);
  });

  it('continues when one provider errors', async () => {
    const exa = { search: vi.fn().mockRejectedValue(new Error('boom')) };
    const builtin = vi.fn().mockResolvedValue([{ title: 'B', url: 'u2', snippet: '', provider: 'brave', rank: 1 }]);
    const out = await runUnified({
      query: 'q',
      lambdaAdapters: { exa: exa as any },
      builtinTools: ['search_brave'],
      callBuiltin: builtin
    });
    expect(out.results).toHaveLength(1);
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0].provider).toBe('exa');
  });
});
