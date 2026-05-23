import { describe, it, expect, vi } from 'vitest';
import { updateProvider } from '../update-provider.js';

describe('updateProvider', () => {
  it('updates enabled+quota and writes audit', async () => {
    const ddb = {
      send: vi
        .fn()
        // GET (before)
        .mockResolvedValueOnce({ Item: { providerId: { S: 'exa' }, enabled: { BOOL: false }, quota: { M: { rpm: { N: '60' }, daily: { N: '1000' } } }, timeoutMs: { N: '8000' } } })
        // UPDATE
        .mockResolvedValueOnce({})
        // AUDIT
        .mockResolvedValueOnce({})
    };
    const out = await updateProvider(ddb as any, 'ConfigTable', 'AuditLogTable', 'user-1', 'exa', {
      enabled: true,
      quota: { rpm: 120, daily: 2000 },
      timeoutMs: 8000
    });
    expect(out.providerId).toBe('exa');
    expect(out.enabled).toBe(true);
    expect(ddb.send).toHaveBeenCalledTimes(3);
  });

  it('rejects invalid input', async () => {
    const ddb = { send: vi.fn() };
    await expect(
      updateProvider(ddb as any, 'C', 'A', 'u', 'exa', { enabled: 'yes' as any, quota: { rpm: -1, daily: 1 }, timeoutMs: 0 })
    ).rejects.toThrow();
    expect(ddb.send).not.toHaveBeenCalled();
  });
});
