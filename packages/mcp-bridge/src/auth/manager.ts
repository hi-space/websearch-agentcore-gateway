import { isExpired, type TokenSet } from './token.js';
import { refreshTokens, type RefreshConfig } from './refresh.js';
import { runPkceLogin, type PkceConfig } from './pkce.js';
import { getDefaultStore, type TokenStore } from './store.js';

export interface ManagerConfig extends RefreshConfig, PkceConfig {
  profile: string;
}

/**
 * Owns the access-token lifecycle for the bridge:
 *   - Loads the persisted TokenSet from the keychain.
 *   - Refreshes proactively before expiry (60s skew, in TokenSet.isExpired).
 *   - Forces PKCE re-login if no token exists or refresh has been revoked.
 *   - Forces re-refresh on demand when Gateway returns 401 mid-session.
 *
 * In-flight refresh attempts are deduped via `inflight` so a burst of MCP
 * tool calls that all see an expired token only triggers one network round
 * trip.
 */
export class TokenManager {
  private current: TokenSet | null = null;
  private inflight: Promise<TokenSet> | null = null;

  constructor(
    private readonly cfg: ManagerConfig,
    private readonly store: TokenStore
  ) {}

  static async create(cfg: ManagerConfig): Promise<TokenManager> {
    const store = await getDefaultStore();
    return new TokenManager(cfg, store);
  }

  /** Returns a non-expired access token, performing refresh / PKCE as needed. */
  async getAccessToken(): Promise<string> {
    if (!this.current) {
      this.current = await this.store.load(this.cfg.profile);
    }
    if (this.current && !isExpired(this.current)) {
      return this.current.accessToken;
    }
    return (await this.acquire()).accessToken;
  }

  /**
   * Invalidates the cached token and acquires a new one. Used when Gateway
   * returns 401 with an unexpired-looking token (server-side revocation).
   */
  async forceRefresh(): Promise<string> {
    this.current = null;
    return (await this.acquire()).accessToken;
  }

  private async acquire(): Promise<TokenSet> {
    if (this.inflight) return this.inflight;
    this.inflight = this.acquireOnce().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async acquireOnce(): Promise<TokenSet> {
    const persisted = this.current ?? (await this.store.load(this.cfg.profile));
    if (persisted) {
      try {
        const refreshed = await refreshTokens(this.cfg, persisted);
        this.current = refreshed;
        await this.store.save(this.cfg.profile, refreshed);
        return refreshed;
      } catch (err) {
        process.stderr.write(`[mcp-bridge] refresh failed (${(err as Error).message}); starting PKCE login\n`);
        await this.store.clear(this.cfg.profile);
      }
    }
    const fresh = await runPkceLogin(this.cfg);
    this.current = fresh;
    await this.store.save(this.cfg.profile, fresh);
    return fresh;
  }
}
