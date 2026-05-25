import { describe, it, expect, vi } from 'vitest';
import { playgroundSearch } from '../playground-search';

describe('playgroundSearch', () => {
  it('invokes search_unified and returns merged results + providersUsed', async () => {
    const payload = JSON.stringify({
      results: [{ title: 'A', url: 'https://a', snippet: 's' }],
      providersUsed: ['arxiv', 'exa'],
      errors: []
    });
    const lambda = {
      send: vi.fn().mockResolvedValue({ Payload: new TextEncoder().encode(payload) })
    };
    const out = await playgroundSearch(lambda as any, 'arn', 'rag eval', 5);
    expect(lambda.send).toHaveBeenCalledTimes(1);
    const cmd = lambda.send.mock.calls[0][0];
    const sent = JSON.parse(new TextDecoder().decode(cmd.input.Payload));
    expect(sent.toolName).toBe('search_unified');
    expect(sent.arguments).toEqual({ query: 'rag eval', topK: 5 });
    expect(out.results).toHaveLength(1);
    expect(out.providersUsed).toEqual(['arxiv', 'exa']);
    expect(out.errors).toEqual([]);
    expect(typeof out.latencyMs).toBe('number');
  });

  it('throws with error code when router returns error envelope', async () => {
    const payload = JSON.stringify({ error: { code: 'INVALID_ARGUMENT', message: 'bad' } });
    const lambda = {
      send: vi.fn().mockResolvedValue({ Payload: new TextEncoder().encode(payload) })
    };
    await expect(playgroundSearch(lambda as any, 'arn', 'q')).rejects.toThrow('INVALID_ARGUMENT');
  });

  it('writes audit row when ddb and audit table are provided', async () => {
    const payload = JSON.stringify({ results: [], providersUsed: ['arxiv'], errors: [] });
    const lambda = { send: vi.fn().mockResolvedValue({ Payload: new TextEncoder().encode(payload) }) };
    const ddb = { send: vi.fn().mockResolvedValue({}) };
    await playgroundSearch(lambda as any, 'arn', 'q', undefined, ddb as any, 'AuditTable', 'user-1');
    expect(ddb.send).toHaveBeenCalledTimes(1);
  });

  it('omits topK from payload when undefined', async () => {
    const payload = JSON.stringify({ results: [], providersUsed: [], errors: [] });
    const lambda = { send: vi.fn().mockResolvedValue({ Payload: new TextEncoder().encode(payload) }) };
    await playgroundSearch(lambda as any, 'arn', 'q');
    const cmd = lambda.send.mock.calls[0][0];
    const sent = JSON.parse(new TextDecoder().decode(cmd.input.Payload));
    expect(sent.arguments).toEqual({ query: 'q' });
  });
});
