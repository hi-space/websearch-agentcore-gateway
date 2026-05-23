import { describe, it, expect, vi } from 'vitest';
import { revealSecret } from '../reveal-secret.js';

describe('revealSecret', () => {
  it('returns secret value once and writes audit (without value)', async () => {
    const sm = { send: vi.fn().mockResolvedValue({ SecretString: 'sk_test_placeholder' }) };
    const ddb = {
      send: vi
        .fn()
        .mockResolvedValueOnce({ Item: { providerId: { S: 'exa' }, secretArn: { S: 'arn:secret:exa' } } })
        .mockResolvedValueOnce({})
    };
    const out = await revealSecret(ddb as any, sm as any, 'ConfigTable', 'AuditLogTable', 'user-1', 'exa');
    expect(out).toEqual({ providerId: 'exa', value: 'sk_test_placeholder' });
    const auditStr = JSON.stringify(ddb.send.mock.calls[1][0].input);
    expect(auditStr).not.toContain('sk_test_placeholder');
    expect(auditStr).toContain('reveal_secret');
  });
});
