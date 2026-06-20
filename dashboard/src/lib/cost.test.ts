import { describe, it, expect } from 'vitest';
import { estimateCost, ENGINE_UNIT_COST_USD, DEFAULT_UNIT_COST_USD } from './cost';

describe('estimateCost', () => {
  it('multiplies invocations by per-1k unit cost and maps tool->engine', () => {
    const rate = ENGINE_UNIT_COST_USD['serper'];
    const { perTool, totalUsd } = estimateCost([
      { name: 'serper___web_search', invocations: 2000 },
    ]);
    expect(perTool[0].engine).toBe('serper');
    expect(perTool[0].estUsd).toBeCloseTo(rate * 2, 6); // 2000 calls = 2 * per-1k
    expect(totalUsd).toBeCloseTo(rate * 2, 6);
  });

  it('uses the default rate for unknown engines but still counts them', () => {
    const { perTool } = estimateCost([{ name: 'mystery___web_search', invocations: 1000 }]);
    expect(perTool[0].estUsd).toBeCloseTo(DEFAULT_UNIT_COST_USD, 6);
  });

  it('treats the managed connector tool as the agentcore engine (no key cost)', () => {
    const { perTool } = estimateCost([{ name: 'web-search___WebSearch', invocations: 1000 }]);
    expect(perTool[0].engine).toBe('agentcore');
  });

  it('returns zero for empty input', () => {
    expect(estimateCost([])).toEqual({ perTool: [], totalUsd: 0 });
  });
});
