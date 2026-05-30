import { describe, it, expect } from 'vitest';
import { refreshTokens } from '../refresh.js';

function fakeFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>): typeof fetch {
  return ((input, init) => Promise.resolve(handler(input, init))) as typeof fetch;
}

describe('refreshTokens', () => {
  it('posts grant_type=refresh_token to the token endpoint', async () => {
    let capturedUrl = '';
    let capturedBody = '';
    const fetchImpl = fakeFetch((input, init) => {
      capturedUrl = String(input);
      capturedBody = String(init?.body ?? '');
      return new Response(JSON.stringify({ access_token: 'A', refresh_token: 'R2', expires_in: 60 }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    });
    const out = await refreshTokens(
      { cognitoDomain: 'https://idp.example', clientId: 'cid', fetchImpl },
      { accessToken: 'old', refreshToken: 'R1', expAt: 0 }
    );
    expect(capturedUrl).toBe('https://idp.example/oauth2/token');
    expect(capturedBody).toContain('grant_type=refresh_token');
    expect(capturedBody).toContain('client_id=cid');
    expect(capturedBody).toContain('refresh_token=R1');
    expect(out.accessToken).toBe('A');
    expect(out.refreshToken).toBe('R2');
  });

  it('throws on non-2xx so callers can switch to PKCE re-login', async () => {
    const fetchImpl = fakeFetch(() => new Response('invalid_grant', { status: 400 }));
    await expect(
      refreshTokens(
        { cognitoDomain: 'https://idp.example', clientId: 'cid', fetchImpl },
        { accessToken: 'a', refreshToken: 'r', expAt: 0 }
      )
    ).rejects.toThrow(/refresh failed: 400/);
  });
});
