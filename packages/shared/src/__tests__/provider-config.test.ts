import { describe, it, expect } from 'vitest';
import { parseProviderConfig } from '../provider-config.js';

describe('parseProviderConfig', () => {
  it('parses a row with required fields', () => {
    const row = {
      providerId: 'exa',
      enabled: true,
      secretArn: 'arn:aws:secretsmanager:us-east-1:111:secret:exa-Ab12',
      quota: { rpm: 60, daily: 10000 },
      timeoutMs: 8000
    };
    expect(parseProviderConfig(row)).toEqual(row);
  });

  it('rejects missing providerId', () => {
    expect(() => parseProviderConfig({ enabled: true })).toThrow();
  });

  it('rejects negative quota', () => {
    expect(() =>
      parseProviderConfig({
        providerId: 'exa',
        enabled: true,
        quota: { rpm: -1, daily: 1 },
        timeoutMs: 1000
      })
    ).toThrow();
  });
});
