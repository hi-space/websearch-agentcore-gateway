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
      url: 'http://arxiv.org/abs/1', title: 't', snippet: 's', provider: 'arxiv'
    }]);
    const handler = createHandler({
      adapters: { arxiv: fakeAdapter },
      quota: fakeQuota,
      limits: { arxiv: { rpm: 60, daily: 1000 } }
    });
    const out = await handler(makeEvent('search_arxiv', { query: 'quantum' }));
    expect(out).toMatchObject({
      results: [{ url: 'http://arxiv.org/abs/1', title: 't', snippet: 's', provider: 'arxiv' }]
    });
    expect(fakeQuota.consume).toHaveBeenCalledWith('arxiv', { rpm: 60, daily: 1000 }, 'service');
  });

  it('routes quota by the __principal field injected by the Gateway interceptor', async () => {
    fakeQuota.consume.mockResolvedValue(undefined);
    fakeAdapter.search.mockResolvedValue([]);
    const handler = createHandler({
      adapters: { arxiv: fakeAdapter },
      quota: fakeQuota,
      limits: { arxiv: { rpm: 60, daily: 1000 } }
    });
    await handler(makeEvent('search_arxiv', { query: 'transformer', __principal: 'user-abc-123' }));
    expect(fakeQuota.consume).toHaveBeenCalledWith('arxiv', { rpm: 60, daily: 1000 }, 'user-abc-123');
    // The principal must not leak into the adapter — adapters validate args
    // strictly and don't expect quota metadata.
    expect(fakeAdapter.search).toHaveBeenCalledWith('transformer', expect.any(Object));
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

  it('fetches and passes secret when adapter requires API key', async () => {
    const keyAdapter = {
      name: 'tavily',
      category: 'web' as const,
      requiresApiKey: true,
      search: vi.fn().mockResolvedValue([{
        url: 'https://x', title: 't', snippet: 's', provider: 'tavily'
      }])
    };
    const fakeSecrets = { get: vi.fn().mockResolvedValue('secret123') };
    fakeQuota.consume.mockResolvedValue(undefined);

    const handler = createHandler({
      adapters: { tavily: keyAdapter },
      quota: fakeQuota,
      limits: { tavily: { rpm: 10, daily: 100 } },
      secrets: fakeSecrets,
      secretArns: { tavily: 'arn:aws:secretsmanager:us-east-1:1:secret:tavily' }
    });

    const out = await handler(makeEvent('search_tavily', { query: 'test' }));
    expect(fakeSecrets.get).toHaveBeenCalledWith('arn:aws:secretsmanager:us-east-1:1:secret:tavily');
    expect(keyAdapter.search).toHaveBeenCalledWith('test', { topK: 10, apiKey: 'secret123' });
    expect(out.results).toHaveLength(1);
  });

  it('returns INTERNAL error when secret cache or ARN is missing for an API-key adapter', async () => {
    const keyAdapter = {
      name: 'tavily',
      category: 'web' as const,
      requiresApiKey: true,
      search: vi.fn()
    };
    fakeQuota.consume.mockResolvedValue(undefined);

    const handler = createHandler({
      adapters: { tavily: keyAdapter },
      quota: fakeQuota,
      limits: { tavily: { rpm: 10, daily: 100 } }
    });

    const out = await handler(makeEvent('search_tavily', { query: 'test' }));
    expect(out.error).toMatchObject({ code: 'INTERNAL', provider: 'tavily' });
    expect(keyAdapter.search).not.toHaveBeenCalled();
  });

  it('emits per-provider metrics for unified search', async () => {
    const arxivAdapter = {
      name: 'arxiv',
      category: 'academic' as const,
      requiresApiKey: false,
      search: vi.fn().mockResolvedValue([
        { url: 'http://arxiv.org/abs/1', title: 't', snippet: 's', provider: 'arxiv', rank: 1 }
      ])
    };
    const exaAdapter = {
      name: 'exa',
      category: 'web' as const,
      requiresApiKey: false,
      search: vi.fn().mockResolvedValue([
        { url: 'http://exa.ai/result', title: 'e', snippet: 'es', provider: 'exa', rank: 1 }
      ])
    };
    const perplexityAdapter = {
      name: 'perplexity',
      category: 'web' as const,
      requiresApiKey: false,
      search: vi.fn().mockRejectedValue(new Error('rate limited'))
    };
    const youAdapter = {
      name: 'you',
      category: 'web' as const,
      requiresApiKey: false,
      search: vi.fn().mockResolvedValue([])
    };

    fakeQuota.consume.mockResolvedValue(undefined);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const handler = createHandler({
      adapters: { arxiv: arxivAdapter, exa: exaAdapter, perplexity: perplexityAdapter, you: youAdapter },
      quota: fakeQuota,
      limits: {
        arxiv: { rpm: 60, daily: 1000 },
        exa: { rpm: 60, daily: 1000 },
        perplexity: { rpm: 60, daily: 1000 },
        you: { rpm: 60, daily: 1000 }
      },
      unified: {
        builtinTools: [],
        callBuiltin: vi.fn()
      }
    });

    const out = await handler(makeEvent('search_unified', { query: 'quantum' }));

    expect('results' in out).toBe(true);
    if (!('results' in out)) return;
    expect(out.results).toHaveLength(2);
    expect(out.providersUsed).toContain('arxiv');
    expect(out.providersUsed).toContain('exa');
    expect(out.providersUsed).toContain('you');
    expect(out.providersUsed).not.toContain('perplexity');

    const logCalls = consoleSpy.mock.calls;
    const metricsJson = logCalls.map((call) => {
      try { return JSON.parse(call[0] as string); } catch { return null; }
    }).filter(Boolean);

    const unifiedMetric = metricsJson.find((m: { Provider?: string }) => m.Provider === 'unified');
    expect(unifiedMetric).toBeDefined();
    expect(unifiedMetric).toMatchObject({ Provider: 'unified', Status: 'Ok' });

    const arxivMetric = metricsJson.find(
      (m: { Provider?: string; Source?: string }) => m.Provider === 'arxiv' && m.Source === 'unified'
    );
    expect(arxivMetric).toBeDefined();

    const perplexityErrMetric = metricsJson.find(
      (m: { Provider?: string; Status?: string; Source?: string }) =>
        m.Provider === 'perplexity' && m.Status === 'Error' && m.Source === 'unified'
    );
    expect(perplexityErrMetric).toBeDefined();

    consoleSpy.mockRestore();
  });
});

describe('handler search_unified', () => {
  it('routes to runUnified and returns merged results', async () => {
    const exa = { name: 'exa', search: vi.fn().mockResolvedValue([{ title: 'A', url: 'u', snippet: '', provider: 'exa', rank: 1 }]) };
    const handler = createHandler({
      adapters: { exa: exa as any },
      quota: { consume: vi.fn().mockResolvedValue(undefined) } as any,
      limits: { exa: { rpm: 60, daily: 1000 } },
      unified: {
        builtinTools: [],
        callBuiltin: vi.fn()
      }
    });
    const res = await handler({ toolName: 'search_unified', arguments: { query: 'cats', topK: 5 } });
    expect('results' in res).toBe(true);
    if ('results' in res) {
      expect(res.providersUsed).toContain('exa');
    }
  });
});

describe('handler AgentCore Gateway payload', () => {
  beforeEach(() => {
    fakeAdapter.search.mockReset();
    fakeQuota.consume.mockReset();
  });

  it('resolves tool name from context.clientContext.custom and reads args from event', async () => {
    fakeQuota.consume.mockResolvedValue(undefined);
    fakeAdapter.search.mockResolvedValue([{
      url: 'http://arxiv.org/abs/1', title: 't', snippet: 's', provider: 'arxiv'
    }]);
    const handler = createHandler({
      adapters: { arxiv: fakeAdapter },
      quota: fakeQuota,
      limits: { arxiv: { rpm: 60, daily: 1000 } }
    });
    // AgentCore Gateway invokes Lambda with flat event (no toolName/arguments wrapper)
    // and tool name in context.clientContext.custom.bedrockAgentCoreToolName
    const res = await handler(
      { query: 'transformer' },
      {
        clientContext: {
          custom: {
            bedrockAgentCoreToolName: 'search-router-search-arxiv___search_arxiv'
          }
        }
      }
    );
    expect(res).toMatchObject({
      results: [{ url: 'http://arxiv.org/abs/1' }]
    });
    expect(fakeAdapter.search).toHaveBeenCalledWith('transformer', expect.any(Object));
  });

  it('falls back to event.toolName when no AgentCore context is present', async () => {
    fakeQuota.consume.mockResolvedValue(undefined);
    fakeAdapter.search.mockResolvedValue([]);
    const handler = createHandler({
      adapters: { arxiv: fakeAdapter },
      quota: fakeQuota,
      limits: { arxiv: { rpm: 60, daily: 1000 } }
    });
    const res = await handler({ toolName: 'search_arxiv', arguments: { query: 'q' } });
    expect('results' in res).toBe(true);
  });
});
