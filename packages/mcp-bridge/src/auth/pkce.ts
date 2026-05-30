import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { fromTokenResponse, type TokenSet } from './token.js';

export interface PkceConfig {
  cognitoDomain: string;
  clientId: string;
  scope: string;
  loopbackPorts: readonly number[];
  /** Defaults to `open` package; tests inject a no-op. */
  openBrowser?: (url: string) => Promise<void>;
  /** Defaults to global fetch; tests inject a stub. */
  fetchImpl?: typeof fetch;
}

/**
 * Runs the OAuth 2.1 native-app PKCE flow (RFC 8252):
 *   1. Generate verifier + challenge.
 *   2. Stand up a one-shot loopback HTTP server on the first free port from
 *      `loopbackPorts`.
 *   3. Open the user's browser to Cognito's /oauth2/authorize.
 *   4. After Cognito redirects to the loopback URL with `code`, exchange it
 *      for tokens at /oauth2/token.
 *
 * The set of acceptable ports has to match what was registered on the user
 * pool client (Cognito requires exact-match callback URLs); the caller passes
 * the same constant the IaC used.
 */
export async function runPkceLogin(cfg: PkceConfig): Promise<TokenSet> {
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash('sha256').update(verifier).digest());
  const state = base64Url(randomBytes(16));

  const { server, port } = await listenOnFirstFreePort(cfg.loopbackPorts);
  const redirectUri = `http://127.0.0.1:${port}/callback`;

  const authorizeUrl = new URL(`${cfg.cognitoDomain}/oauth2/authorize`);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', cfg.clientId);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('scope', cfg.scope);
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('code_challenge', challenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');

  const codePromise = new Promise<string>((resolve, reject) => {
    server.on('request', (req: IncomingMessage, res: ServerResponse) => {
      try {
        const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
        if (url.pathname !== '/callback') {
          res.writeHead(404).end();
          return;
        }
        const returnedState = url.searchParams.get('state');
        const code = url.searchParams.get('code');
        if (returnedState !== state) {
          res.writeHead(400, { 'content-type': 'text/plain' }).end('state mismatch');
          reject(new Error('PKCE state mismatch — possible CSRF attempt'));
          return;
        }
        if (!code) {
          const err = url.searchParams.get('error') ?? 'missing code';
          res.writeHead(400, { 'content-type': 'text/plain' }).end(err);
          reject(new Error(`PKCE flow failed: ${err}`));
          return;
        }
        res
          .writeHead(200, { 'content-type': 'text/html' })
          .end('<!doctype html><meta charset="utf-8"><title>Logged in</title><body><p>Login successful — you can close this tab.</p></body>');
        resolve(code);
      } catch (err) {
        res.writeHead(500).end();
        reject(err as Error);
      }
    });
  });

  try {
    await openBrowser(cfg, authorizeUrl.toString());
    process.stderr.write(`[mcp-bridge] Waiting for browser login at ${redirectUri}\n`);
    const code = await codePromise;
    return await exchangeCodeForTokens(cfg, code, verifier, redirectUri);
  } finally {
    server.close();
  }
}

async function exchangeCodeForTokens(
  cfg: PkceConfig,
  code: string,
  verifier: string,
  redirectUri: string
): Promise<TokenSet> {
  const fetchImpl = cfg.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: cfg.clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier
  });
  const res = await fetchImpl(`${cfg.cognitoDomain}/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) {
    throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  return fromTokenResponse(json);
}

async function openBrowser(cfg: PkceConfig, url: string): Promise<void> {
  if (cfg.openBrowser) {
    await cfg.openBrowser(url);
    return;
  }
  const mod = (await import('open')) as { default: (url: string) => Promise<unknown> };
  await mod.default(url);
}

async function listenOnFirstFreePort(
  ports: readonly number[]
): Promise<{ server: ReturnType<typeof createServer>; port: number }> {
  for (const port of ports) {
    try {
      const server = createServer();
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
          server.removeListener('error', reject);
          resolve();
        });
      });
      return { server, port };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EADDRINUSE') throw err;
    }
  }
  throw new Error(`No loopback port free in ${ports.join(',')} — close other apps and retry`);
}

function base64Url(buf: Buffer): string {
  return buf.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
