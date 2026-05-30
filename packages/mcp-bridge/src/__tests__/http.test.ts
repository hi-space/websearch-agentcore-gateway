import { describe, it, expect, vi } from 'vitest';
import { createAuthorizedFetch } from '../http.js';
import type { TokenManager } from '../auth/manager.js';

interface FakeTracker {
  manager: TokenManager;
  refreshes(): number;
}

function fakeManager(initial: string, refreshed: string): FakeTracker {
  let count = 0;
  const manager = {
    async getAccessToken() { return initial; },
    async forceRefresh() { count++; return refreshed; }
  } as unknown as TokenManager;
  return { manager, refreshes: () => count };
}

describe('createAuthorizedFetch', () => {
  it('attaches Bearer header from the manager', async () => {
    const tracker = fakeManager('A', 'B');
    const manager = tracker.manager;
    let captured: Headers | undefined;
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      captured = new Headers(init?.headers);
      return new Response('ok', { status: 200 });
    });
    const f = createAuthorizedFetch({ manager, fetchImpl: fetchImpl as unknown as typeof fetch });
    await f('https://gw.example/mcp', { method: 'POST' });
    expect(captured?.get('authorization')).toBe('Bearer A');
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    const tracker = fakeManager('A', 'B');
    const captured: string[] = [];
    let calls = 0;
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      captured.push(new Headers(init?.headers).get('authorization') ?? '');
      if (calls === 1) return new Response('expired', { status: 401 });
      return new Response('ok', { status: 200 });
    });
    const f = createAuthorizedFetch({ manager: tracker.manager, fetchImpl: fetchImpl as unknown as typeof fetch });
    const res = await f('https://gw.example/mcp', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(captured).toEqual(['Bearer A', 'Bearer B']);
    expect(tracker.refreshes()).toBe(1);
  });

  it('does not retry past one 401 — surfaces it to the caller', async () => {
    const tracker = fakeManager('A', 'B');
    const fetchImpl = vi.fn(async () => new Response('still expired', { status: 401 }));
    const f = createAuthorizedFetch({ manager: tracker.manager, fetchImpl: fetchImpl as unknown as typeof fetch });
    const res = await f('https://gw.example/mcp', { method: 'POST' });
    expect(res.status).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('passes non-401 responses through unchanged', async () => {
    const tracker = fakeManager('A', 'B');
    const fetchImpl = vi.fn(async () => new Response('boom', { status: 500 }));
    const f = createAuthorizedFetch({ manager: tracker.manager, fetchImpl: fetchImpl as unknown as typeof fetch });
    const res = await f('https://gw.example/mcp');
    expect(res.status).toBe(500);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(tracker.refreshes()).toBe(0);
  });
});
