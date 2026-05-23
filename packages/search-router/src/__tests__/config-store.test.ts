import { describe, it, expect, vi } from 'vitest';
import { loadEnabledProviders } from '../config-store.js';

describe('loadEnabledProviders', () => {
  it('returns only enabled providers, validated', async () => {
    const ddb = {
      send: vi.fn().mockResolvedValue({
        Items: [
          { providerId: { S: 'exa' }, enabled: { BOOL: true }, secretArn: { S: 'arn:1' }, quota: { M: { rpm: { N: '60' }, daily: { N: '1000' } } }, timeoutMs: { N: '8000' } },
          { providerId: { S: 'you' }, enabled: { BOOL: false }, quota: { M: { rpm: { N: '60' }, daily: { N: '1000' } } }, timeoutMs: { N: '8000' } }
        ]
      })
    };
    const out = await loadEnabledProviders(ddb as any, 'ConfigTable');
    expect(out.map((p) => p.providerId)).toEqual(['exa']);
  });
});
