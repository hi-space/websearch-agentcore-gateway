import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TokenManager } from '../manager.js';
import type { TokenStore } from '../store.js';
import type { TokenSet } from '../token.js';

function makeStore(initial: TokenSet | null = null): TokenStore & { snapshot(): TokenSet | null } {
  let value: TokenSet | null = initial;
  return {
    async load() { return value; },
    async save(_p, t) { value = t; },
    async clear() { value = null; },
    snapshot() { return value; }
  };
}

const baseCfg = {
  profile: 'default',
  cognitoDomain: 'https://idp.example',
  clientId: 'cid',
  scope: 'gateway/invoke',
  loopbackPorts: [11111] as const
};

describe('TokenManager', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('returns a cached, unexpired access token without hitting the network', async () => {
    const future = Date.now() + 3600_000;
    const store = makeStore({ accessToken: 'cached', refreshToken: 'r', expAt: future });
    const fetchImpl = vi.fn();
    const mgr = new TokenManager({ ...baseCfg, fetchImpl: fetchImpl as unknown as typeof fetch }, store);
    expect(await mgr.getAccessToken()).toBe('cached');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refreshes using the refresh_token when the cached access token is expired', async () => {
    const store = makeStore({ accessToken: 'old', refreshToken: 'rtok', expAt: 0 });
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ access_token: 'new', refresh_token: 'rtok2', expires_in: 600 }), { status: 200 })
    );
    const mgr = new TokenManager({ ...baseCfg, fetchImpl: fetchImpl as unknown as typeof fetch }, store);
    expect(await mgr.getAccessToken()).toBe('new');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(store.snapshot()?.refreshToken).toBe('rtok2');
  });

  it('dedupes concurrent acquire() calls into a single refresh', async () => {
    const store = makeStore({ accessToken: 'old', refreshToken: 'rtok', expAt: 0 });
    let resolveBody: ((v: Response) => void) | null = null;
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((r) => {
          resolveBody = r;
        })
    );
    const mgr = new TokenManager({ ...baseCfg, fetchImpl: fetchImpl as unknown as typeof fetch }, store);
    const p1 = mgr.getAccessToken();
    const p2 = mgr.getAccessToken();
    // Yield enough microtasks for the async chain to reach the fetch call.
    for (let i = 0; i < 5; i++) await Promise.resolve();
    // Both calls should be waiting on the same in-flight refresh.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    resolveBody!(
      new Response(JSON.stringify({ access_token: 'new', refresh_token: 'rtok2', expires_in: 600 }), { status: 200 })
    );
    expect(await p1).toBe('new');
    expect(await p2).toBe('new');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('forceRefresh invalidates the cache and acquires a new token', async () => {
    const future = Date.now() + 3600_000;
    const store = makeStore({ accessToken: 'cached', refreshToken: 'r', expAt: future });
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ access_token: 'replacement', refresh_token: 'r2', expires_in: 600 }), { status: 200 })
    );
    const mgr = new TokenManager({ ...baseCfg, fetchImpl: fetchImpl as unknown as typeof fetch }, store);
    // First call: served from cache, no network.
    expect(await mgr.getAccessToken()).toBe('cached');
    expect(fetchImpl).not.toHaveBeenCalled();
    // forceRefresh invalidates and triggers exactly one refresh.
    expect(await mgr.forceRefresh()).toBe('replacement');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
