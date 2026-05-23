import { describe, it, expect, vi } from 'vitest';
import { putSecret } from '../put-secret';

describe('putSecret', () => {
  it('stores via PutSecretValue and writes audit (no value in audit)', async () => {
    const sm = { send: vi.fn().mockResolvedValue({ ARN: 'arn:secret:exa', VersionId: 'v1' }) };
    const ddb = {
      send: vi
        .fn()
        // GET provider to find secretArn
        .mockResolvedValueOnce({ Item: { providerId: { S: 'exa' }, secretArn: { S: 'arn:secret:exa' } } })
        // AUDIT
        .mockResolvedValueOnce({})
    };
    const out = await putSecret(ddb as any, sm as any, 'ConfigTable', 'AuditLogTable', 'user-1', 'exa', 'sk_test_placeholder');
    expect(out).toEqual({ providerId: 'exa', versionId: 'v1' });
    const auditCall = ddb.send.mock.calls[1][0].input;
    const auditStr = JSON.stringify(auditCall);
    expect(auditStr).not.toContain('sk_test_placeholder');
  });
});
