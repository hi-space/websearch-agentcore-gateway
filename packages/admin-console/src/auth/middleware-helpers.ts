import type { AuthCtx } from './verify-jwt.js';

export function extractToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

export function requireRole(role: AuthCtx['role'], allowed: AuthCtx['role'][]): boolean {
  return allowed.includes(role);
}
