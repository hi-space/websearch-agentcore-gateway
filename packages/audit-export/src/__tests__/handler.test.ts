import { describe, it, expect, vi } from 'vitest';
import { createHandler } from '../handler.js';

describe('audit-export handler', () => {
  it('writes one S3 object per stream record (NEW image only)', async () => {
    const s3 = { send: vi.fn().mockResolvedValue({}) };
    const handler = createHandler({ s3: s3 as any, bucket: 'audit-bucket' });
    await handler({
      Records: [
        {
          eventName: 'INSERT',
          dynamodb: {
            NewImage: {
              actor: { S: 'u1' },
              ts: { S: '2026-05-23T10:00:00Z' },
              action: { S: 'reveal_secret' },
              target: { S: 'provider:exa' }
            }
          }
        }
      ]
    } as any);
    expect(s3.send).toHaveBeenCalledTimes(1);
    const args = s3.send.mock.calls[0][0].input;
    expect(args.Bucket).toBe('audit-bucket');
    expect(args.Key).toMatch(/^2026\/05\/23\/u1_/);
    expect(args.ObjectLockMode).toBe('COMPLIANCE');
  });

  it('skips MODIFY/REMOVE (audit rows are immutable)', async () => {
    const s3 = { send: vi.fn() };
    const handler = createHandler({ s3: s3 as any, bucket: 'b' });
    await handler({ Records: [{ eventName: 'MODIFY', dynamodb: {} } as any] } as any);
    expect(s3.send).not.toHaveBeenCalled();
  });
});
