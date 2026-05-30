import { describe, it, expect, vi } from 'vitest';
import { listProviders } from '../list-providers';

describe('listProviders', () => {
  it('returns rows with lastVerify when present, omits it otherwise', async () => {
    const ddb = {
      send: vi.fn().mockResolvedValue({
        Items: [
          {
            providerId: { S: 'exa' },
            enabled: { BOOL: true },
            secretArn: { S: 'arn:x' },
            quota: { M: { rpm: { N: '60' }, daily: { N: '1000' } } },
            timeoutMs: { N: '8000' },
            lastVerify: {
              M: {
                at: { S: '2026-05-28T12:00:00.000Z' },
                ok: { BOOL: true }
              }
            }
          },
          {
            providerId: { S: 'arxiv' },
            enabled: { BOOL: false },
            quota: { M: { rpm: { N: '60' }, daily: { N: '1000' } } },
            timeoutMs: { N: '8000' }
          }
        ]
      })
    };
    const out = await listProviders(ddb as any, 'ConfigTable');
    expect(out[0]).toEqual({
      providerId: 'exa',
      enabled: true,
      hasSecret: true,
      quota: { rpm: 60, daily: 1000 },
      timeoutMs: 8000,
      lastVerify: { at: '2026-05-28T12:00:00.000Z', ok: true }
    });
    expect(out[1]).toEqual({
      providerId: 'arxiv',
      enabled: false,
      hasSecret: false,
      quota: { rpm: 60, daily: 1000 },
      timeoutMs: 8000
    });
  });
});
