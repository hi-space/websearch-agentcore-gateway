import { NextResponse, type NextRequest } from 'next/server';
import { exchangeCodeForTokens, PKCE_COOKIE, readOAuthEnv, SESSION_COOKIE } from '../../../../src/auth/oauth';

export async function GET(req: NextRequest) {
  const env = readOAuthEnv(req.url, {
    'x-forwarded-host': req.headers.get('x-forwarded-host'),
    'x-forwarded-proto': req.headers.get('x-forwarded-proto')
  });
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) {
    return NextResponse.json({ error: 'INVALID_CALLBACK' }, { status: 400 });
  }
  const pkceCookie = req.cookies.get(PKCE_COOKIE)?.value;
  if (!pkceCookie) {
    return NextResponse.json({ error: 'MISSING_PKCE' }, { status: 400 });
  }
  let pkce: { verifier: string; state: string };
  try {
    pkce = JSON.parse(pkceCookie);
  } catch {
    return NextResponse.json({ error: 'BAD_PKCE' }, { status: 400 });
  }
  if (pkce.state !== state) {
    return NextResponse.json({ error: 'STATE_MISMATCH' }, { status: 400 });
  }

  const tokens = await exchangeCodeForTokens(env, code, pkce.verifier);
  const res = NextResponse.redirect(`${env.consoleBaseUrl}/admin`);
  res.cookies.set(SESSION_COOKIE, tokens.id_token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: tokens.expires_in
  });
  res.cookies.set(PKCE_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
