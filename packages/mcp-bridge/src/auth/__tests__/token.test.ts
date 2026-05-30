import { describe, it, expect } from 'vitest';
import { fromTokenResponse, isExpired, SKEW_MS } from '../token.js';

describe('TokenSet', () => {
  it('marks tokens expired SKEW_MS before their expAt', () => {
    const now = 1_000_000;
    expect(isExpired({ accessToken: 'a', refreshToken: 'r', expAt: now + SKEW_MS - 1 }, now)).toBe(true);
    expect(isExpired({ accessToken: 'a', refreshToken: 'r', expAt: now + SKEW_MS + 1 }, now)).toBe(false);
  });

  it('preserves a previous refresh token when the response omits one (no rotation)', () => {
    const prev = { accessToken: 'old', refreshToken: 'r1', expAt: 0 };
    const t = fromTokenResponse({ access_token: 'new', expires_in: 3600 }, prev, 1_000);
    expect(t.refreshToken).toBe('r1');
    expect(t.accessToken).toBe('new');
    expect(t.expAt).toBe(1_000 + 3600 * 1000);
  });

  it('uses the new refresh token when rotation issues one', () => {
    const prev = { accessToken: 'old', refreshToken: 'r1', expAt: 0 };
    const t = fromTokenResponse({ access_token: 'new', refresh_token: 'r2', expires_in: 3600 }, prev, 0);
    expect(t.refreshToken).toBe('r2');
  });

  it('throws when neither response nor previous have a refresh token', () => {
    expect(() => fromTokenResponse({ access_token: 'x', expires_in: 60 })).toThrow(/refresh_token/);
  });
});
