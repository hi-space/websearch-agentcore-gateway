import { NextResponse, type NextRequest } from 'next/server';
import { makeVerifier } from '@/src/auth/verify-jwt';
import { extractToken } from '@/src/auth/middleware-helpers';

const verify = makeVerifier({
  userPoolId: process.env.COGNITO_USER_POOL_ID!,
  clientId: process.env.COGNITO_CLIENT_ID!
});

export async function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith('/api/') && !req.nextUrl.pathname.startsWith('/admin/')) {
    return NextResponse.next();
  }
  const token = extractToken(req.headers.get('authorization'));
  if (!token) {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }
  try {
    const ctx = await verify(token);
    const res = NextResponse.next();
    res.headers.set('x-auth-sub', ctx.sub);
    res.headers.set('x-auth-role', ctx.role);
    if (ctx.email) res.headers.set('x-auth-email', ctx.email);
    return res;
  } catch {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }
}

export const config = { matcher: ['/api/:path*', '/admin/:path*'] };
