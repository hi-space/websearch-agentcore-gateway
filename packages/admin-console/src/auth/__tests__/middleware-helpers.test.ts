import { describe, it, expect, vi } from 'vitest';
import { extractToken, requireRole } from '../middleware-helpers';

describe('extractToken', () => {
  it('reads "Authorization: Bearer ..."', () => {
    expect(extractToken('Bearer abc')).toBe('abc');
  });
  it('returns null when missing', () => {
    expect(extractToken(null)).toBeNull();
  });
});

describe('requireRole', () => {
  it('allows admin on admin-only', () => {
    expect(requireRole('admin', ['admin'])).toBe(true);
  });
  it('rejects viewer on admin-only', () => {
    expect(requireRole('viewer', ['admin'])).toBe(false);
  });
  it('allows viewer on read endpoints', () => {
    expect(requireRole('viewer', ['admin', 'editor', 'viewer'])).toBe(true);
  });
});
