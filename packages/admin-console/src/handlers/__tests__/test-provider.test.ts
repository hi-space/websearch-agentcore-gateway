import { describe, it, expect, vi } from 'vitest';
import { testProvider } from '../test-provider';

const enc = (obj: unknown) => Buffer.from(JSON.stringify(obj));

describe('testProvider', () => {
  it('returns ok with results count and persists lastVerify.ok=true', async () => {
    const lambda = { send: vi.fn().mockResolvedValue({ Payload: enc({ results: [{ url: 'u' }, { url: 'v' }], providersUsed: ['exa'] }) }) };
    const ddb = { send: vi.fn().mockResolvedValue({}) };
    const out = await testProvider(
      lambda as any,
      'router-arn',
      'exa',
      ddb as any,
      'ConfigTable',
      'AuditLogTable',
      'user-1',
      () => Date.parse('2026-05-28T12:00:00.000Z')
    );
    expect(out).toMatchObject({ ok: true, results: 2 });
    expect(out.lastVerify).toEqual({ at: '2026-05-28T12:00:00.000Z', ok: true });

    const updateInput = ddb.send.mock.calls[0][0].input;
    expect(updateInput.TableName).toBe('ConfigTable');
    expect(updateInput.Key).toEqual({ pk: { S: 'provider' }, sk: { S: 'exa' } });
    expect(updateInput.UpdateExpression).toMatch(/SET lastVerify = :lv/);
  });

  it('returns ok=false and persists lastVerify with code/error on router error envelope', async () => {
    const lambda = { send: vi.fn().mockResolvedValue({ Payload: enc({ error: { code: 'UPSTREAM_ERROR', message: 'UPSTREAM_ERROR: exa 401' } }) }) };
    const ddb = { send: vi.fn().mockResolvedValue({}) };
    const out = await testProvider(
      lambda as any,
      'router-arn',
      'exa',
      ddb as any,
      'ConfigTable',
      'AuditLogTable',
      'user-1',
      () => Date.parse('2026-05-28T12:00:00.000Z')
    );
    expect(out).toMatchObject({ ok: false, error: 'UPSTREAM_ERROR' });
    expect(out.lastVerify).toEqual({
      at: '2026-05-28T12:00:00.000Z',
      ok: false,
      code: 'UPSTREAM_ERROR',
      error: 'UPSTREAM_ERROR: exa 401'
    });
  });

  it('does not write to ConfigTable when configTable arg is omitted', async () => {
    const lambda = { send: vi.fn().mockResolvedValue({ Payload: enc({ results: [], providersUsed: ['exa'] }) }) };
    await testProvider(lambda as any, 'router-arn', 'exa');
    // No ddb client passed → no UpdateItem to assert on; the call simply must not throw.
    expect(lambda.send).toHaveBeenCalledTimes(1);
  });
});
