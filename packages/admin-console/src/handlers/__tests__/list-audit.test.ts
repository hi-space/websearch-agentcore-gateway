import { describe, it, expect, vi } from 'vitest';
import { listAudit } from '../list-audit.js';

describe('listAudit', () => {
  it('returns paginated rows newest first', async () => {
    const ddb = {
      send: vi.fn().mockResolvedValue({
        Items: [
          { actor: { S: 'u1' }, ts: { S: '2026-05-23T10:00:00Z' }, action: { S: 'reveal_secret' }, target: { S: 'provider:exa' } }
        ]
      })
    };
    const out = await listAudit(ddb as any, 'AuditLogTable', 50);
    expect(out[0]).toMatchObject({ actor: 'u1', action: 'reveal_secret', target: 'provider:exa' });
  });
});
