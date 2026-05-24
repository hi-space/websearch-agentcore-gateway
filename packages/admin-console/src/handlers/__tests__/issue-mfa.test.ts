import { describe, it, expect, vi } from 'vitest';
import { issueStepUp } from '../issue-mfa';

describe('issueStepUp', () => {
  it('issues an assertion and writes mfa_step_up_issued audit row', async () => {
    const kms = {
      send: vi.fn().mockResolvedValue({ Signature: new Uint8Array([1, 2, 3]) })
    };
    const ddb = { send: vi.fn().mockResolvedValue({}) };
    const out = await issueStepUp(kms as any, ddb as any, 'k', 'AuditLogTable', 'user-1', 1_700_000_000_000);
    expect(out.expiresAt).toBe(1_700_000_000_000 + 5 * 60 * 1000);
    expect(out.payload).toBeTruthy();
    expect(out.signature).toBeTruthy();
    const auditStr = JSON.stringify(ddb.send.mock.calls[0][0].input);
    expect(auditStr).toContain('mfa_step_up_issued');
    expect(auditStr).toContain('user-1');
  });
});
