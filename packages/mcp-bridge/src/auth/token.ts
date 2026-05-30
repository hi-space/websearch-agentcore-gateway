/**
 * Token bookkeeping with a small clock-skew tolerance.
 *
 * `expAt` is the absolute epoch-ms when the access token stops being usable;
 * we treat it as expired `SKEW_MS` early so a request in flight never crosses
 * the boundary.
 */

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expAt: number;
}

export const SKEW_MS = 60_000;

export function isExpired(token: TokenSet, now = Date.now()): boolean {
  return token.expAt - SKEW_MS <= now;
}

export function fromTokenResponse(
  res: { access_token: string; refresh_token?: string; expires_in: number },
  previous?: TokenSet | undefined,
  now = Date.now()
): TokenSet {
  // Cognito's refresh-token rotation may either return a new refresh_token or
  // omit it (meaning: keep the previous one). Honour both.
  const refreshToken = res.refresh_token ?? previous?.refreshToken;
  if (!refreshToken) {
    throw new Error('token response did not include a refresh_token and no previous token to fall back on');
  }
  return {
    accessToken: res.access_token,
    refreshToken,
    expAt: now + res.expires_in * 1000
  };
}
