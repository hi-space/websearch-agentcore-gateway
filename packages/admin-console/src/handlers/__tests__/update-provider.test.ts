import { describe, it, expect, vi } from 'vitest';
import { updateProvider } from '../update-provider';
import { LambdaClient } from '@aws-sdk/client-lambda';

describe('updateProvider', () => {
  it('updates enabled+quota and writes audit', async () => {
    const ddb = {
      send: vi
        .fn()
        // GET (before)
        .mockResolvedValueOnce({ Item: { providerId: { S: 'exa' }, enabled: { BOOL: false }, quota: { M: { rpm: { N: '60' }, daily: { N: '1000' } } }, timeoutMs: { N: '8000' } } })
        // UPDATE
        .mockResolvedValueOnce({})
        // AUDIT
        .mockResolvedValueOnce({})
    };
    const lambda = { send: vi.fn() };
    const out = await updateProvider(ddb as any, lambda as unknown as LambdaClient, 'router-arn', 'ConfigTable', 'AuditLogTable', 'user-1', 'exa', {
      enabled: false,
      quota: { rpm: 120, daily: 2000 },
      timeoutMs: 8000
    });
    expect(out.providerId).toBe('exa');
    expect(out.enabled).toBe(false);
    expect(ddb.send).toHaveBeenCalledTimes(3);
  });

  it('rejects invalid input', async () => {
    const ddb = { send: vi.fn() };
    const lambda = { send: vi.fn() };
    await expect(
      updateProvider(ddb as any, lambda as unknown as LambdaClient, 'router-arn', 'C', 'A', 'u', 'exa', { enabled: 'yes' as any, quota: { rpm: -1, daily: 1 }, timeoutMs: 0 })
    ).rejects.toThrow();
    expect(ddb.send).not.toHaveBeenCalled();
  });
});

const enc = (obj: unknown) => Buffer.from(JSON.stringify(obj));

describe('updateProvider verified-enable gate', () => {
  function makeDeps(routerPayload: unknown, beforeEnabled = false) {
    const ddb = {
      send: vi
        .fn()
        // GET (before)
        .mockResolvedValueOnce({
          Item: {
            providerId: { S: 'exa' },
            enabled: { BOOL: beforeEnabled },
            quota: { M: { rpm: { N: '60' }, daily: { N: '1000' } } },
            timeoutMs: { N: '8000' }
          }
        })
        // UPDATE
        .mockResolvedValueOnce({})
        // AUDIT
        .mockResolvedValueOnce({})
    };
    const lambda = { send: vi.fn().mockResolvedValue({ Payload: enc(routerPayload) }) };
    return { ddb, lambda };
  }

  it('OFF→ON: probe success persists enabled=true and lastVerify.ok=true', async () => {
    const { ddb, lambda } = makeDeps({ results: [], providersUsed: ['exa'] }, false);
    const out = await updateProvider(
      ddb as any,
      lambda as unknown as LambdaClient,
      'router-arn',
      'ConfigTable',
      'AuditLogTable',
      'user-1',
      'exa',
      { enabled: true, quota: { rpm: 120, daily: 2000 }, timeoutMs: 8000 }
    );
    expect(out.enabled).toBe(true);
    expect(out.lastVerify?.ok).toBe(true);
    const updateInput = ddb.send.mock.calls[1][0].input;
    expect(updateInput.UpdateExpression).toMatch(/SET #enabled = :e, quota = :q, timeoutMs = :t, lastVerify = :lv/);
    const values = updateInput.ExpressionAttributeValues;
    expect(values[':e']).toEqual({ BOOL: true });
    expect(values[':lv'].M.ok).toEqual({ BOOL: true });
    expect(lambda.send).toHaveBeenCalledTimes(1);
  });

  it('OFF→ON: probe error envelope clamps enabled=false and surfaces VERIFICATION_FAILED', async () => {
    const { ddb, lambda } = makeDeps({ error: { code: 'UPSTREAM_ERROR', message: 'UPSTREAM_ERROR: exa 401' } }, false);
    await expect(
      updateProvider(
        ddb as any,
        lambda as unknown as LambdaClient,
        'router-arn',
        'ConfigTable',
        'AuditLogTable',
        'user-1',
        'exa',
        { enabled: true, quota: { rpm: 60, daily: 1000 }, timeoutMs: 8000 }
      )
    ).rejects.toMatchObject({
      message: 'VERIFICATION_FAILED',
      lastVerify: { ok: false, code: 'UPSTREAM_ERROR' }
    });
    const updateInput = ddb.send.mock.calls[1][0].input;
    expect(updateInput.ExpressionAttributeValues[':e']).toEqual({ BOOL: false });
    expect(updateInput.ExpressionAttributeValues[':lv'].M.ok).toEqual({ BOOL: false });
  });

  it('OFF→ON: lambda invoke throws → INVOKE_FAILED, enabled clamped', async () => {
    const ddb = {
      send: vi
        .fn()
        .mockResolvedValueOnce({
          Item: {
            providerId: { S: 'exa' },
            enabled: { BOOL: false },
            quota: { M: { rpm: { N: '60' }, daily: { N: '1000' } } },
            timeoutMs: { N: '8000' }
          }
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
    };
    const lambda = { send: vi.fn().mockRejectedValue(new Error('throttled')) };
    await expect(
      updateProvider(
        ddb as any,
        lambda as unknown as LambdaClient,
        'router-arn',
        'ConfigTable',
        'AuditLogTable',
        'user-1',
        'exa',
        { enabled: true, quota: { rpm: 60, daily: 1000 }, timeoutMs: 8000 }
      )
    ).rejects.toMatchObject({
      message: 'VERIFICATION_FAILED',
      lastVerify: { ok: false, code: 'INVOKE_FAILED', error: 'throttled' }
    });
  });

  it('ON→ON / ON→OFF / quota-only: probe is not invoked', async () => {
    for (const next of [
      { enabled: true, quota: { rpm: 10, daily: 100 }, timeoutMs: 8000 },
      { enabled: false, quota: { rpm: 60, daily: 1000 }, timeoutMs: 8000 }
    ]) {
      const { ddb, lambda } = makeDeps({ results: [] }, true);
      await updateProvider(
        ddb as any,
        lambda as unknown as LambdaClient,
        'router-arn',
        'ConfigTable',
        'AuditLogTable',
        'user-1',
        'exa',
        next
      );
      expect(lambda.send).not.toHaveBeenCalled();
    }
  });
});
