import { describe, it, expect, vi } from 'vitest';
import { testProvider } from '../test-provider';

describe('testProvider', () => {
  it('invokes the search-router Lambda with a probe query', async () => {
    const lambda = {
      send: vi.fn().mockResolvedValue({
        Payload: new TextEncoder().encode(JSON.stringify({ results: [{ title: 'A', url: 'u', snippet: '', provider: 'exa', rank: 1 }], providersUsed: ['exa'] }))
      })
    };
    const out = await testProvider(lambda as any, 'search-router-arn', 'exa');
    expect(out.ok).toBe(true);
    expect(out.results).toBeGreaterThan(0);
  });

  it('returns ok=false when the router returns an error', async () => {
    const lambda = {
      send: vi.fn().mockResolvedValue({
        Payload: new TextEncoder().encode(JSON.stringify({ error: { code: 'UPSTREAM_ERROR', message: 'down' } }))
      })
    };
    const out = await testProvider(lambda as any, 'arn', 'exa');
    expect(out.ok).toBe(false);
    expect(out.error).toBe('UPSTREAM_ERROR');
  });

  it('writes audit row when audit table and ddb are provided', async () => {
    const lambda = {
      send: vi.fn().mockResolvedValue({
        Payload: new TextEncoder().encode(JSON.stringify({ results: [{ title: 'A', url: 'u', snippet: '', provider: 'exa', rank: 1 }] }))
      })
    };
    const ddb = { send: vi.fn().mockResolvedValue({}) };
    const out = await testProvider(lambda as any, 'arn', 'exa', ddb as any, 'AuditTable', 'user-1');
    expect(out.ok).toBe(true);
    expect(ddb.send).toHaveBeenCalledTimes(1);
  });
});
