export const VERIFY_FRESH_MS = 60 * 60 * 1000;

export interface LastVerify {
  at: string;
  ok: boolean;
  error?: string;
  code?: string;
}

export type VerifyStatus = 'verified' | 'stale' | 'failed' | 'unverified';

export function getVerifyStatus(lv: LastVerify | undefined, now: number = Date.now()): VerifyStatus {
  if (!lv) return 'unverified';
  if (!lv.ok) return 'failed';
  const at = Date.parse(lv.at);
  if (Number.isNaN(at)) return 'unverified';
  return now - at <= VERIFY_FRESH_MS ? 'verified' : 'stale';
}
