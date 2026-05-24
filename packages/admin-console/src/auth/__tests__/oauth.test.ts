import { describe, it, expect } from 'vitest';
import {
  buildAuthorizeUrl,
  codeChallenge,
  exchangeCodeForTokens,
  generateCodeVerifier,
  readOAuthEnv
} from '../oauth';

const env = {
  hostedUiBaseUrl: 'https://example-pool.auth.us-east-1.amazoncognito.com',
  clientId: 'cli-123',
  consoleBaseUrl: 'https://admin.example.test'
};

describe('oauth helpers', () => {
  it('produces a base64url verifier of correct length', () => {
    const v = generateCodeVerifier();
    expect(v).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(v.length).toBeGreaterThanOrEqual(43);
  });

  it('hashes verifier to S256 challenge deterministically', () => {
    expect(codeChallenge('aBc-123')).toBe(codeChallenge('aBc-123'));
    expect(codeChallenge('a').includes('=')).toBe(false);
  });

  it('builds an authorize URL with all required params', () => {
    const u = new URL(buildAuthorizeUrl(env, { state: 's', codeChallenge: 'ch' }));
    expect(u.origin + u.pathname).toBe(`${env.hostedUiBaseUrl}/oauth2/authorize`);
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('client_id')).toBe('cli-123');
    expect(u.searchParams.get('redirect_uri')).toBe(`${env.consoleBaseUrl}/api/auth/callback`);
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('state')).toBe('s');
    expect(u.searchParams.get('code_challenge')).toBe('ch');
  });

  it('readOAuthEnv throws when env vars are missing', () => {
    const prev = { ...process.env };
    delete process.env.COGNITO_HOSTED_UI_BASE_URL;
    delete process.env.COGNITO_OAUTH_CLIENT_ID;
    delete process.env.ADMIN_CONSOLE_BASE_URL;
    try {
      expect(() => readOAuthEnv()).toThrow();
    } finally {
      process.env = prev;
    }
  });

  it('exchangeCodeForTokens posts the expected form body and returns parsed tokens', async () => {
    let captured: { url: string; body: string; headers: Record<string, string> } | null = null;
    const fakeFetch: typeof fetch = (async (url: any, init: any) => {
      captured = {
        url: String(url),
        body: String(init.body),
        headers: init.headers as Record<string, string>
      };
      return new Response(
        JSON.stringify({ id_token: 'idt', access_token: 'at', expires_in: 3600, token_type: 'Bearer' }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as any;
    const tokens = await exchangeCodeForTokens(env, 'CODE', 'VER', fakeFetch);
    expect(tokens.id_token).toBe('idt');
    expect(tokens.expires_in).toBe(3600);
    expect(captured!.url).toBe(`${env.hostedUiBaseUrl}/oauth2/token`);
    const params = new URLSearchParams(captured!.body);
    expect(params.get('grant_type')).toBe('authorization_code');
    expect(params.get('code')).toBe('CODE');
    expect(params.get('code_verifier')).toBe('VER');
    expect(params.get('redirect_uri')).toBe(`${env.consoleBaseUrl}/api/auth/callback`);
  });
});
