import { describe, it, expect, vi } from 'vitest';
import { issueMfaAssertion, verifyMfaAssertion, assertionFingerprint } from '../mfa-assertion';

function makeKms(verifyOk = true) {
  return {
    send: vi.fn().mockImplementation((cmd: any) => {
      const ctor = cmd?.constructor?.name;
      if (ctor === 'SignCommand') return Promise.resolve({ Signature: new Uint8Array([1, 2, 3]) });
      if (ctor === 'VerifyCommand') return Promise.resolve({ SignatureValid: verifyOk });
      return Promise.resolve({});
    })
  };
}

describe('mfa-assertion', () => {
  const NOW = 1_700_000_000_000;

  it('issue → verify round-trips with matching sub within 5 min', async () => {
    const kms = makeKms(true) as any;
    const a = await issueMfaAssertion(kms, 'k', 'user-1', NOW);
    expect(a.expiresAt).toBe(NOW + 5 * 60 * 1000);
    const payload = await verifyMfaAssertion(kms, 'k', a, 'user-1', NOW + 60_000);
    expect(payload.sub).toBe('user-1');
  });

  it('rejects with STEP_UP_REQUIRED when sub mismatches', async () => {
    const kms = makeKms(true) as any;
    const a = await issueMfaAssertion(kms, 'k', 'user-1', NOW);
    await expect(verifyMfaAssertion(kms, 'k', a, 'user-2', NOW)).rejects.toThrow('STEP_UP_REQUIRED');
  });

  it('rejects with STEP_UP_REQUIRED when older than 5 min', async () => {
    const kms = makeKms(true) as any;
    const a = await issueMfaAssertion(kms, 'k', 'user-1', NOW);
    await expect(verifyMfaAssertion(kms, 'k', a, 'user-1', NOW + 6 * 60 * 1000)).rejects.toThrow('STEP_UP_REQUIRED');
  });

  it('rejects with STEP_UP_REQUIRED when KMS verify fails', async () => {
    const kms = makeKms(false) as any;
    const a = await issueMfaAssertion(kms, 'k', 'user-1', NOW);
    await expect(verifyMfaAssertion(kms, 'k', a, 'user-1', NOW)).rejects.toThrow('STEP_UP_REQUIRED');
  });

  it('rejects malformed payloads', async () => {
    const kms = makeKms(true) as any;
    await expect(verifyMfaAssertion(kms, 'k', { payload: '!!!', signature: 'x' }, 'u', NOW))
      .rejects.toThrow('STEP_UP_REQUIRED');
  });

  it('fingerprint changes when payload or signature changes', () => {
    const fp1 = assertionFingerprint({ payload: 'a', signature: 'b' });
    const fp2 = assertionFingerprint({ payload: 'a', signature: 'c' });
    const fp3 = assertionFingerprint({ payload: 'a', signature: 'b' });
    expect(fp1).not.toEqual(fp2);
    expect(fp1).toEqual(fp3);
  });
});
