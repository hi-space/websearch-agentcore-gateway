import { describe, it, expect } from 'vitest';
import { getVerifyStatus, VERIFY_FRESH_MS, type LastVerify } from '../verify-status';

const NOW = Date.parse('2026-05-28T12:00:00.000Z');
const isoMinusMin = (m: number) => new Date(NOW - m * 60_000).toISOString();

describe('getVerifyStatus', () => {
  it('returns "unverified" when lastVerify is undefined', () => {
    expect(getVerifyStatus(undefined, NOW)).toBe('unverified');
  });

  it('returns "failed" when lastVerify.ok is false', () => {
    const lv: LastVerify = { at: isoMinusMin(1), ok: false, code: 'UPSTREAM_ERROR' };
    expect(getVerifyStatus(lv, NOW)).toBe('failed');
  });

  it('returns "verified" inside the fresh window', () => {
    const lv: LastVerify = { at: isoMinusMin(59), ok: true };
    expect(getVerifyStatus(lv, NOW)).toBe('verified');
  });

  it('returns "verified" exactly at the fresh boundary', () => {
    const lv: LastVerify = { at: isoMinusMin(60), ok: true };
    expect(getVerifyStatus(lv, NOW)).toBe('verified');
  });

  it('returns "stale" past the fresh window', () => {
    const lv: LastVerify = { at: isoMinusMin(61), ok: true };
    expect(getVerifyStatus(lv, NOW)).toBe('stale');
  });

  it('exports VERIFY_FRESH_MS as 1 hour', () => {
    expect(VERIFY_FRESH_MS).toBe(60 * 60 * 1000);
  });
});
