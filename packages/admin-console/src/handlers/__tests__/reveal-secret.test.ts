import { describe, it, expect, vi, beforeEach } from 'vitest';
import { revealSecret } from '../reveal-secret';

describe('revealSecret', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function baseInput(overrides: any = {}) {
    const sm = { send: vi.fn().mockResolvedValue({ SecretString: 'sk_test_placeholder' }) };
    const ddb = {
      send: vi.fn().mockImplementation((cmd: any) => {
        const ctor = cmd?.constructor?.name;
        if (ctor === 'GetItemCommand') {
          return Promise.resolve({ Item: { providerId: { S: 'exa' }, secretArn: { S: 'arn:secret:exa' } } });
        }
        return Promise.resolve({});
      })
    };
    return {
      ddb: ddb as any, sm: sm as any,
      configTable: 'ConfigTable', auditTable: 'AuditLogTable',
      actor: 'user-1', providerId: 'exa',
      reason: 'rotate key per Q2 review',
      ...overrides
    };
  }

  it('returns secret value and writes audit row without exposing the value', async () => {
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

  it('throws NOT_FOUND when provider config has no secretArn', async () => {
    const input = baseInput();
    (input.ddb.send as any).mockImplementation((cmd: any) => {
      if (cmd?.constructor?.name === 'GetItemCommand') return Promise.resolve({ Item: { providerId: { S: 'exa' } } });
      return Promise.resolve({});
    });
    await expect(revealSecret(input)).rejects.toThrow('NOT_FOUND');
  });
});
