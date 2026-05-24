import { describe, it, expect, vi, beforeEach } from 'vitest';
import { revealSecret } from '../reveal-secret';

const validAssertion = { payload: 'p', signature: 's' };

function makeKms(verifyOk = true) {
  return {
    send: vi.fn().mockImplementation((cmd: any) => {
      const ctor = cmd?.constructor?.name;
      if (ctor === 'VerifyCommand') return Promise.resolve({ SignatureValid: verifyOk });
      return Promise.resolve({});
    })
  };
}

// Stub the assertion module so tests don't need to round-trip a real signature.
vi.mock('../../auth/mfa-assertion', () => ({
  verifyMfaAssertion: vi.fn(async (_kms: any, _key: string, _assert: any, sub: string) => ({
    sub, nonce: 'n', iat: Date.now()
  })),
  assertionFingerprint: vi.fn((a: any) => `fp-${a.payload}-${a.signature}`)
}));

describe('revealSecret (MFA-hardened)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  function baseInput(overrides: any = {}) {
    const sm = { send: vi.fn().mockResolvedValue({ SecretString: 'sk_test_placeholder' }) };
    // 5 calls expected on success path:
    // 0: consumeAssertion PutItem (replay guard) → no error
    // 1: bumpHourlyCounter UpdateItem → returns count
    // 2: GetItemCommand on ConfigTable
    // 3: writeAudit PutItem (audit log)
    const ddb = {
      send: vi.fn().mockImplementation((cmd: any) => {
        const ctor = cmd?.constructor?.name;
        if (ctor === 'PutItemCommand') return Promise.resolve({});
        if (ctor === 'UpdateItemCommand') return Promise.resolve({ Attributes: { count: { N: '1' } } });
        if (ctor === 'GetItemCommand') {
          return Promise.resolve({ Item: { providerId: { S: 'exa' }, secretArn: { S: 'arn:secret:exa' } } });
        }
        return Promise.resolve({});
      })
    };
    return {
      ddb: ddb as any, sm: sm as any, kms: makeKms() as any,
      configTable: 'ConfigTable', auditTable: 'AuditLogTable', replayTable: 'MfaReplay',
      mfaKeyId: 'kms-id', actor: 'user-1', providerId: 'exa',
      reason: 'rotate key per Q2 review', assertion: validAssertion,
      ...overrides
    };
  }

  it('returns secret value, consumes assertion, bumps counter, audits without value', async () => {
    const input = baseInput();
    const out = await revealSecret(input);
    expect(out).toEqual({ providerId: 'exa', value: 'sk_test_placeholder' });
    const auditCalls = (input.ddb.send as any).mock.calls.filter((c: any) => c[0]?.constructor?.name === 'PutItemCommand');
    const lastAuditStr = JSON.stringify(auditCalls.at(-1)[0].input);
    expect(lastAuditStr).toContain('reveal_secret');
    expect(lastAuditStr).not.toContain('sk_test_placeholder');
  });

  it('rejects when reason is too short', async () => {
    await expect(revealSecret(baseInput({ reason: 'no' }))).rejects.toThrow('INVALID_INPUT');
  });

  it('throws STEP_UP_REQUIRED on assertion replay (conditional check fails)', async () => {
    const input = baseInput();
    (input.ddb.send as any).mockImplementationOnce(() => {
      const err: any = new Error('replay');
      err.name = 'ConditionalCheckFailedException';
      return Promise.reject(err);
    });
    await expect(revealSecret(input)).rejects.toThrow('STEP_UP_REQUIRED');
  });

  it('throws RATE_LIMITED when hourly count exceeds cap', async () => {
    const input = baseInput();
    (input.ddb.send as any).mockImplementation((cmd: any) => {
      const ctor = cmd?.constructor?.name;
      if (ctor === 'PutItemCommand') return Promise.resolve({});
      if (ctor === 'UpdateItemCommand') return Promise.resolve({ Attributes: { count: { N: '6' } } });
      return Promise.resolve({});
    });
    await expect(revealSecret(input)).rejects.toThrow('RATE_LIMITED');
  });
});
