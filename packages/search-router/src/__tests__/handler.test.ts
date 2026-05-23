import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ErrorCode, SearchError } from '@search-gateway/shared';
import { createHandler } from '../handler.js';

const fakeAdapter = {
  name: 'arxiv',
  category: 'academic' as const,
  requiresApiKey: false,
  search: vi.fn()
};

const fakeQuota = { consume: vi.fn() };

const makeEvent = (tool: string, args: unknown) => ({
  toolName: tool,
  arguments: args
});

describe('search-router handler', () => {
  beforeEach(() => {
    fakeAdapter.search.mockReset();
    fakeQuota.consume.mockReset();
  });

  it('returns SearchResult[] on success', async () => {
    fakeQuota.consume.mockResolvedValue(undefined);
    fakeAdapter.search.mockResolvedValue([{
      url: 'http://arxiv.org/abs/1', title: 't', snippet: 's', source: 'arxiv'
    }]);
    const handler = createHandler({
      adapters: { arxiv: fakeAdapter },
      quota: fakeQuota,
      limits: { arxiv: { rpm: 60, daily: 1000 } }
    });
    const out = await handler(makeEvent('search_arxiv', { query: 'quantum' }));
    expect(out).toMatchObject({
      results: [{ url: 'http://arxiv.org/abs/1', title: 't', snippet: 's', source: 'arxiv' }]
    });
    expect(fakeQuota.consume).toHaveBeenCalledWith('arxiv', { rpm: 60, daily: 1000 });
  });

  it('returns RATE_LIMITED error envelope when quota throws', async () => {
    fakeQuota.consume.mockRejectedValue(
      new SearchError(ErrorCode.RATE_LIMITED, 'rpm', { provider: 'arxiv', retryAfterSec: 12 })
    );
    const handler = createHandler({
      adapters: { arxiv: fakeAdapter },
      quota: fakeQuota,
      limits: { arxiv: { rpm: 60, daily: 1000 } }
    });
    const out = await handler(makeEvent('search_arxiv', { query: 'q' }));
    expect(out.error).toMatchObject({
      code: 'RATE_LIMITED', provider: 'arxiv', retryAfterSec: 12
    });
  });

  it('rejects unknown tool names with INVALID_ARGUMENT', async () => {
    const handler = createHandler({
      adapters: { arxiv: fakeAdapter },
      quota: fakeQuota,
      limits: { arxiv: { rpm: 60, daily: 1000 } }
    });
    const out = await handler(makeEvent('search_nonexistent', { query: 'q' }));
    expect(out.error).toMatchObject({ code: 'INVALID_ARGUMENT' });
  });
});
