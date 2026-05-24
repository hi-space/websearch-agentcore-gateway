import { createHash, randomBytes } from 'node:crypto';

export interface OAuthEnv {
  hostedUiBaseUrl: string;
  clientId: string;
  consoleBaseUrl: string;
}

export const SESSION_COOKIE = 'id_token';
export const PKCE_COOKIE = 'oauth_pkce';

// Derives the OAuth env from process env + the incoming request URL. consoleBaseUrl comes from
// the request rather than env to avoid a Lambda → CloudFront → Lambda dependency cycle at deploy
// time (distribution.domainName is a runtime token; baking it into Lambda env reverses the
// natural construct ordering inside AdminConsoleStack).
export function readOAuthEnv(requestUrl: string | URL): OAuthEnv {
  const hostedUiBaseUrl = process.env.COGNITO_HOSTED_UI_BASE_URL;
  const clientId = process.env.COGNITO_OAUTH_CLIENT_ID;
  if (!hostedUiBaseUrl || !clientId) {
    throw new Error('Cognito Hosted UI env vars missing — login flow not configured');
  }
  const u = typeof requestUrl === 'string' ? new URL(requestUrl) : requestUrl;
  const consoleBaseUrl = `${u.protocol}//${u.host}`;
  return { hostedUiBaseUrl, clientId, consoleBaseUrl };
}

export function generateCodeVerifier(): string {
  return base64Url(randomBytes(32));
}

export function codeChallenge(verifier: string): string {
  return base64Url(createHash('sha256').update(verifier).digest());
}

export function buildAuthorizeUrl(env: OAuthEnv, opts: { state: string; codeChallenge: string }): string {
  const u = new URL(`${env.hostedUiBaseUrl}/oauth2/authorize`);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', env.clientId);
  u.searchParams.set('redirect_uri', `${env.consoleBaseUrl}/api/auth/callback`);
  u.searchParams.set('scope', 'openid email profile');
  u.searchParams.set('state', opts.state);
  u.searchParams.set('code_challenge', opts.codeChallenge);
  u.searchParams.set('code_challenge_method', 'S256');
  return u.toString();
}

export interface TokenResponse {
  id_token: string;
  access_token: string;
  expires_in: number;
  token_type: string;
}

export async function exchangeCodeForTokens(
  env: OAuthEnv,
  code: string,
  verifier: string,
  fetchImpl: typeof fetch = fetch
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: env.clientId,
    code,
    redirect_uri: `${env.consoleBaseUrl}/api/auth/callback`,
    code_verifier: verifier
  });
  const res = await fetchImpl(`${env.hostedUiBaseUrl}/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) {
    throw new Error(`token exchange failed: ${res.status}`);
  }
  return res.json() as Promise<TokenResponse>;
}

function base64Url(buf: Buffer): string {
  return buf.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
