import { describe, it, expect, vi } from 'vitest';
import { callGatewayBuiltin } from '../gateway-client.js';

describe('callGatewayBuiltin', () => {
  it('calls Gateway tools/call and maps results', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: {
          content: [{ type: 'json', json: { results: [{ title: 'T', url: 'u', snippet: 's' }] } }]
        }
      })
    });
    const out = await callGatewayBuiltin(
      { gatewayUrl: 'https://gw', token: 'jwt', tool: 'search_tavily', query: 'cats', topK: 3 },
      fetcher as any
    );
    expect(out).toEqual([{ title: 'T', url: 'u', snippet: 's', provider: 'tavily', rank: 1 }]);
  });

  it('throws UPSTREAM_ERROR on 5xx', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 502, text: async () => '' });
    await expect(
      callGatewayBuiltin({ gatewayUrl: 'https://gw', token: 'jwt', tool: 'search_brave', query: 'q' }, fetcher as any)
    ).rejects.toThrow(/UPSTREAM_ERROR/);
  });
});
