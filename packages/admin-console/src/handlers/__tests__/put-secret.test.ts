import { describe, it, expect, vi } from 'vitest';
import { putSecret } from '../put-secret';

describe('putSecret', () => {
  it('stores via PutSecretValue, then disables provider and clears lastVerify in a single UpdateItem, and writes redacted audit', async () => {
    const sm = { send: vi.fn().mockResolvedValue({ ARN: 'arn:secret:exa', VersionId: 'v1' }) };
    const ddb = {
      send: vi
        .fn()
        // GET provider to find secretArn
        .mockResolvedValueOnce({ Item: { providerId: { S: 'exa' }, secretArn: { S: 'arn:secret:exa' } } })
        // UPDATE — REMOVE lastVerify, SET enabled=false
        .mockResolvedValueOnce({})
        // AUDIT
        .mockResolvedValueOnce({})
    };
    const out = await putSecret(ddb as any, sm as any, 'ConfigTable', 'AuditLogTable', 'user-1', 'exa', 'sk_test_placeholder');
    expect(out).toEqual({ providerId: 'exa', versionId: 'v1' });

    const getKey = ddb.send.mock.calls[0][0].input.Key;
    expect(getKey).toEqual({ pk: { S: 'provider' }, sk: { S: 'exa' } });

    const updateInput = ddb.send.mock.calls[1][0].input;
    expect(updateInput.Key).toEqual({ pk: { S: 'provider' }, sk: { S: 'exa' } });
    expect(updateInput.UpdateExpression).toMatch(/SET #enabled = :e REMOVE lastVerify/);
    expect(updateInput.ExpressionAttributeNames).toMatchObject({ '#enabled': 'enabled' });
    expect(updateInput.ExpressionAttributeValues).toMatchObject({ ':e': { BOOL: false } });

    const auditStr = JSON.stringify(ddb.send.mock.calls[2][0].input);
    expect(auditStr).not.toContain('sk_test_placeholder');
  });
});
