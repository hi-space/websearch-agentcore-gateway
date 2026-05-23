import { describe, it, expect, vi } from 'vitest';
import { listProviders } from '../list-providers';

describe('listProviders', () => {
  it('returns rows redacted (no secret value)', async () => {
    const ddb = {
      send: vi.fn().mockResolvedValue({
        Items: [
          { providerId: { S: 'exa' }, enabled: { BOOL: true }, secretArn: { S: 'arn:x' }, quota: { M: { rpm: { N: '60' }, daily: { N: '1000' } } }, timeoutMs: { N: '8000' } }
        ]
      })
    };
    const out = await listProviders(ddb as any, 'ConfigTable');
    expect(out[0]).toEqual({
      providerId: 'exa',
      enabled: true,
      hasSecret: true,
      quota: { rpm: 60, daily: 1000 },
      timeoutMs: 8000
    });
  });
});
