import { describe, it, expect, vi } from 'vitest';
import { probeProvider } from '../probe-provider';

const enc = (obj: unknown) => Buffer.from(JSON.stringify(obj));

describe('probeProvider', () => {
  it('returns ok=true when router responds with results', async () => {
    const lambda = {
      send: vi.fn().mockResolvedValue({ Payload: enc({ results: [{ url: 'u', title: 't', snippet: 's', provider: 'exa' }], providersUsed: ['exa'] }) })
    };
    const out = await probeProvider(lambda as any, 'router-arn', 'exa', () => Date.parse('2026-05-28T12:00:00.000Z'));
    expect(out.ok).toBe(true);
    expect(out.at).toBe('2026-05-28T12:00:00.000Z');
    expect(out.error).toBeUndefined();
  });

  it('returns ok=false with code/error when router responds with an error envelope', async () => {
    const lambda = {
      send: vi.fn().mockResolvedValue({ Payload: enc({ error: { code: 'UPSTREAM_ERROR', message: 'UPSTREAM_ERROR: exa 401' } }) })
    };
    const out = await probeProvider(lambda as any, 'router-arn', 'exa', () => Date.parse('2026-05-28T12:00:00.000Z'));
    expect(out).toEqual({
      at: '2026-05-28T12:00:00.000Z',
      ok: false,
      code: 'UPSTREAM_ERROR',
      error: 'UPSTREAM_ERROR: exa 401'
    });
  });

  it('returns ok=false with code=INVOKE_FAILED when invoke throws', async () => {
    const lambda = { send: vi.fn().mockRejectedValue(new Error('throttled')) };
    const out = await probeProvider(lambda as any, 'router-arn', 'exa', () => Date.parse('2026-05-28T12:00:00.000Z'));
    expect(out).toEqual({
      at: '2026-05-28T12:00:00.000Z',
      ok: false,
      code: 'INVOKE_FAILED',
      error: 'throttled'
    });
  });

  it('sends an InvokeCommand with toolName=search_<id> and a probe query', async () => {
    const send = vi.fn().mockResolvedValue({ Payload: enc({ results: [], providersUsed: ['exa'] }) });
    await probeProvider({ send } as any, 'router-arn', 'exa', () => Date.now());
    const cmd = send.mock.calls[0][0];
    expect(cmd.input.FunctionName).toBe('router-arn');
    const payload = JSON.parse(Buffer.from(cmd.input.Payload).toString());
    expect(payload).toEqual({ toolName: 'search_exa', arguments: { query: 'connectivity probe' } });
  });
});
