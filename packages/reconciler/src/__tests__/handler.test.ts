import { describe, it, expect, vi } from 'vitest';
import { createHandler } from '../handler.js';

describe('reconciler handler', () => {
  it('emits a metric and log entry per drift', async () => {
    const ddb = { send: vi.fn().mockResolvedValue({ Items: [{ providerId: { S: 'exa' }, enabled: { BOOL: true } }] }) };
    const listGatewayTargets = vi.fn().mockResolvedValue(['legacy']);
    const emitMetric = vi.fn();
    const log = { info: vi.fn(), warn: vi.fn() };
    const handler = createHandler({ ddb: ddb as any, configTable: 'C', gatewayId: 'g', listGatewayTargets, emitMetric, log: log as any });
    const out = await handler();
    expect(out.missing).toEqual(['search_exa']);
    expect(out.extra).toEqual(['legacy']);
    expect(emitMetric).toHaveBeenCalledWith('ReconcilerDrift', 2);
    expect(log.warn).toHaveBeenCalled();
  });

  it('emits ReconcilerDrift=0 on clean state', async () => {
    const ddb = { send: vi.fn().mockResolvedValue({ Items: [{ providerId: { S: 'exa' }, enabled: { BOOL: true } }] }) };
    const listGatewayTargets = vi.fn().mockResolvedValue(['search_exa']);
    const emitMetric = vi.fn();
    const log = { info: vi.fn(), warn: vi.fn() };
    const handler = createHandler({ ddb: ddb as any, configTable: 'C', gatewayId: 'g', listGatewayTargets, emitMetric, log: log as any });
    await handler();
    expect(emitMetric).toHaveBeenCalledWith('ReconcilerDrift', 0);
  });
});
