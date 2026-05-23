import { describe, it, expect, vi, afterEach } from 'vitest';
import { exaAdapter } from '../exa.js';

const fixture = {
  results: [
    { title: 'A', url: 'https://a', text: 'snip', score: 0.9 },
    { title: 'B', url: 'https://b', text: 'snip', score: 0.8 }
  ]
};

describe('exaAdapter', () => {
  afterEach(() => vi.restoreAllMocks());

  it('maps response to SearchResult[]', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => fixture }));
    const out = await exaAdapter.search('cats', { topK: 2, apiKey: 'k' });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ title: 'A', url: 'https://a', provider: 'exa', rank: 1 });
  });

  it('throws UPSTREAM_ERROR on 5xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => 'down' }));
    await expect(exaAdapter.search('cats', { apiKey: 'k' })).rejects.toThrow(/UPSTREAM_ERROR/);
  });

  it('throws INVALID_ARGUMENT when query is empty', async () => {
    await expect(exaAdapter.search('', { apiKey: 'k' })).rejects.toThrow(/INVALID_ARGUMENT/);
  });
});
