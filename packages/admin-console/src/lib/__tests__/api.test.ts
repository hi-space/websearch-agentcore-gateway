import { describe, it, expect, vi, afterEach } from 'vitest';
import { adminApi } from '../api.js';

describe('adminApi', () => {
  afterEach(() => vi.restoreAllMocks());

  it('listProviders parses the response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          providers: [{ providerId: 'exa', enabled: true, hasSecret: true, quota: { rpm: 60, daily: 1000 }, timeoutMs: 8000 }]
        })
      })
    );
    const out = await adminApi.listProviders();
    expect(out[0].providerId).toBe('exa');
  });

  it('throws ApiError on 4xx with body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: 'FORBIDDEN' }) }));
    await expect(adminApi.listProviders()).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });
});
