import { describe, it, expect, vi, afterEach } from 'vitest';
import { perplexityAdapter } from '../perplexity.js';

const fixture = {
  choices: [
    {
      message: {
        citations: [
          { title: 'A', url: 'https://a', snippet: 's1' },
          { title: 'B', url: 'https://b', snippet: 's2' }
        ]
      }
    }
  ]
};

describe('perplexityAdapter', () => {
  afterEach(() => vi.restoreAllMocks());

  it('maps citations to SearchResult[]', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => fixture }));
    const out = await perplexityAdapter.search('cats', { apiKey: 'k', topK: 2 });
    expect(out).toHaveLength(2);
    expect(out[0].provider).toBe('perplexity');
  });

  it('throws on missing api key', async () => {
    await expect(perplexityAdapter.search('cats', {})).rejects.toThrow(/INTERNAL/);
  });
});
