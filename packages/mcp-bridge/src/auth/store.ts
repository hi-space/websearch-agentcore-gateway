/**
 * OS keychain wrapper around `keytar`. Each Bridge profile gets its own
 * keychain entry, keyed on `(SERVICE_NAME, profile)`. Entries are JSON blobs
 * holding a TokenSet — refresh tokens stay out of the filesystem and out of
 * process env vars.
 */

import type { TokenSet } from './token.js';

export const SERVICE_NAME = 'search-gateway-mcp-bridge';

export interface TokenStore {
  load(profile: string): Promise<TokenSet | null>;
  save(profile: string, token: TokenSet): Promise<void>;
  clear(profile: string): Promise<void>;
}

interface KeytarLike {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

class KeytarStore implements TokenStore {
  constructor(private readonly keytar: KeytarLike) {}

  async load(profile: string): Promise<TokenSet | null> {
    const raw = await this.keytar.getPassword(SERVICE_NAME, profile);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as TokenSet;
    } catch {
      return null;
    }
  }

  async save(profile: string, token: TokenSet): Promise<void> {
    await this.keytar.setPassword(SERVICE_NAME, profile, JSON.stringify(token));
  }

  async clear(profile: string): Promise<void> {
    await this.keytar.deletePassword(SERVICE_NAME, profile);
  }
}

let cached: TokenStore | undefined;

export async function getDefaultStore(): Promise<TokenStore> {
  if (cached) return cached;
  const mod = (await import('keytar')) as { default?: KeytarLike } & KeytarLike;
  const keytar = (mod.default ?? mod) as KeytarLike;
  cached = new KeytarStore(keytar);
  return cached;
}

// Test seam — production code uses getDefaultStore().
export function _setStore(store: TokenStore): void {
  cached = store;
}
