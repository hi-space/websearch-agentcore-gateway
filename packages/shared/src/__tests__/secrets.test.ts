import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  SecretsManagerClient,
  GetSecretValueCommand
} from '@aws-sdk/client-secrets-manager';
import { createSecretsCache } from '../secrets.js';

const sm = mockClient(SecretsManagerClient);

describe('createSecretsCache', () => {
  beforeEach(() => { sm.reset(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns the secret string and caches it for the TTL', async () => {
    sm.on(GetSecretValueCommand).resolves({ SecretString: 'tvly-abcd' });
    const cache = createSecretsCache({ ttlMs: 60_000 });
    expect(await cache.get('arn:1')).toBe('tvly-abcd');
    expect(await cache.get('arn:1')).toBe('tvly-abcd');
    expect(sm.commandCalls(GetSecretValueCommand)).toHaveLength(1);
  });

  it('refetches after the TTL elapses', async () => {
    sm.on(GetSecretValueCommand)
      .resolvesOnce({ SecretString: 'old' })
      .resolves({ SecretString: 'new' });
    const cache = createSecretsCache({ ttlMs: 60_000 });
    expect(await cache.get('arn:1')).toBe('old');
    vi.advanceTimersByTime(60_001);
    expect(await cache.get('arn:1')).toBe('new');
  });

  it('throws if SecretString is missing', async () => {
    sm.on(GetSecretValueCommand).resolves({});
    const cache = createSecretsCache({ ttlMs: 60_000 });
    await expect(cache.get('arn:1')).rejects.toThrow(/SecretString missing/);
  });
});
