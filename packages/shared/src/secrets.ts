import {
  SecretsManagerClient,
  GetSecretValueCommand
} from '@aws-sdk/client-secrets-manager';

export interface SecretsCacheOptions {
  ttlMs?: number;
  client?: SecretsManagerClient;
}

interface Entry { value: string; expiresAt: number }

export interface SecretsCache {
  get(arn: string): Promise<string>;
  invalidate(arn: string): void;
}

export function createSecretsCache(opts: SecretsCacheOptions = {}): SecretsCache {
  const ttlMs = opts.ttlMs ?? 5 * 60_000;
  const client = opts.client ?? new SecretsManagerClient({});
  const cache = new Map<string, Entry>();

  return {
    async get(arn) {
      const now = Date.now();
      const hit = cache.get(arn);
      if (hit && hit.expiresAt > now) return hit.value;
      const out = await client.send(new GetSecretValueCommand({ SecretId: arn }));
      if (!out.SecretString) throw new Error(`SecretString missing for ${arn}`);
      cache.set(arn, { value: out.SecretString, expiresAt: now + ttlMs });
      return out.SecretString;
    },
    invalidate(arn) { cache.delete(arn); }
  };
}
