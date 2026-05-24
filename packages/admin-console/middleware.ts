import { NextResponse, type NextRequest } from 'next/server';
import { makeVerifier } from '@/src/auth/verify-jwt';
import { extractToken } from '@/src/auth/middleware-helpers';
import { SESSION_COOKIE } from '@/src/auth/cookies';

const verifyAccess = makeVerifier({
  userPoolId: process.env.COGNITO_USER_POOL_ID!,
  clientId: process.env.COGNITO_CLIENT_ID!,
  tokenUse: 'access'
});

const oauthClientId = process.env.COGNITO_OAUTH_CLIENT_ID;
const verifyId = oauthClientId
  ? makeVerifier({
      userPoolId: process.env.COGNITO_USER_POOL_ID!,
      clientId: oauthClientId,
      tokenUse: 'id'
    })
  : null;

const PUBLIC_PATHS = new Set(['/api/auth/login', '/api/auth/callback']);

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (PUBLIC_PATHS.has(path)) return NextResponse.next();
  if (!path.startsWith('/api/') && !path.startsWith('/admin/')) {
    return NextResponse.next();
  }

  const bearer = extractToken(req.headers.get('authorization'));
  const cookieToken = req.cookies.get(SESSION_COOKIE)?.value ?? null;
  const isHtml = req.headers.get('accept')?.includes('text/html');

  const unauthorized = () => {
    if (isHtml && verifyId) {
      return NextResponse.redirect(new URL('/api/auth/login', req.url));
    }
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  };

  try {
    let ctx;
    if (bearer) {
      ctx = await verifyAccess(bearer);
    } else if (cookieToken && verifyId) {
      ctx = await verifyId(cookieToken);
    } else {
      return unauthorized();
    }
    const res = NextResponse.next();
    res.headers.set('x-auth-sub', ctx.sub);
    res.headers.set('x-auth-role', ctx.role);
    if (ctx.email) res.headers.set('x-auth-email', ctx.email);
    return res;
  } catch {
    return unauthorized();
  }
}

export const config = { matcher: ['/api/:path*', '/admin/:path*'] };
