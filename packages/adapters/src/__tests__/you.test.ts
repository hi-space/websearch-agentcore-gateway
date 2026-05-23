import { describe, it, expect, vi, afterEach } from 'vitest';
import { youAdapter } from '../you.js';

const fixture = {
  hits: [
    { title: 'A', url: 'https://a', description: 'd1' },
    { title: 'B', url: 'https://b', description: 'd2' }
  ]
};

describe('youAdapter', () => {
  afterEach(() => vi.restoreAllMocks());

  it('maps hits to SearchResult[]', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => fixture }));
    const out = await youAdapter.search('cats', { apiKey: 'k', topK: 2 });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ provider: 'you', rank: 1 });
  });
});
