import { fromTokenResponse, type TokenSet } from './token.js';

export interface RefreshConfig {
  cognitoDomain: string;
  clientId: string;
  fetchImpl?: typeof fetch;
}

/**
 * Calls Cognito's /oauth2/token with `grant_type=refresh_token`. Cognito may
 * either return a fresh refresh_token (rotation enabled) or omit it; the
 * caller's TokenSet is threaded through `fromTokenResponse` so the previous
 * refresh token survives if no new one is issued.
 *
 * Throws on any non-2xx. A 4xx here typically means the refresh token has
 * been revoked (rotation, logout-everywhere, password change), so the caller
 * is expected to start a fresh PKCE login — that is the documented re-auth
 * path, not an error-recovery hack.
 */
export async function refreshTokens(cfg: RefreshConfig, previous: TokenSet): Promise<TokenSet> {
  const fetchImpl = cfg.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: cfg.clientId,
    refresh_token: previous.refreshToken
  });
  const res = await fetchImpl(`${cfg.cognitoDomain}/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) {
    throw new Error(`refresh failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  return fromTokenResponse(json, previous);
}
