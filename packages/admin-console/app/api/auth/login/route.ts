import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';
import {
  buildAuthorizeUrl,
  codeChallenge,
  generateCodeVerifier,
  PKCE_COOKIE,
  readOAuthEnv
} from '../../../../src/auth/oauth';

export async function GET(_req: NextRequest) {
  const env = readOAuthEnv();
  const verifier = generateCodeVerifier();
  const state = randomBytes(16).toString('hex');
  const url = buildAuthorizeUrl(env, { state, codeChallenge: codeChallenge(verifier) });
  const res = NextResponse.redirect(url);
  res.cookies.set(PKCE_COOKIE, JSON.stringify({ verifier, state }), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600
  });
  return res;
}
