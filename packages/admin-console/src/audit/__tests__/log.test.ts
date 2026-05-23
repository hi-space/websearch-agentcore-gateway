import { describe, it, expect, vi } from 'vitest';
import { writeAudit } from '../log.js';

describe('writeAudit', () => {
  it('writes an audit row to AuditLogTable', async () => {
    const ddb = { send: vi.fn().mockResolvedValue({}) };
    await writeAudit(ddb as any, 'AuditLogTable', {
      actor: 'user-1',
      action: 'reveal_secret',
      target: 'provider:exa',
      before: undefined,
      after: { revealed: true }
    });
    const args = ddb.send.mock.calls[0][0].input;
    expect(args.TableName).toBe('AuditLogTable');
    expect(args.Item.actor.S).toBe('user-1');
    expect(args.Item.action.S).toBe('reveal_secret');
    expect(args.Item.ts.S).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
