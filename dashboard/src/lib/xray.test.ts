import { describe, it, expect } from 'vitest';
import { extractToolName, normalizeSummary, buildSpanList, xrayIdToLogTraceId } from './xray';
import summariesFixture from './__fixtures__/trace-summaries.json';
import batchFixture from './__fixtures__/trace-batch.json';

describe('extractToolName', () => {
  it('extracts the tool id from a span name', () => {
    expect(extractToolName('AgentCore.Gateway.InvokeTool.you___you_search')).toBe('you___you_search');
  });
  it('returns null when there is no "___" tool token', () => {
    expect(extractToolName('AgentCore.Gateway.InvokeTool')).toBeNull();
  });
  it('returns null for undefined input', () => {
    expect(extractToolName(undefined)).toBeNull();
  });
});

describe('normalizeSummary', () => {
  const withTool = (summariesFixture.TraceSummaries as any[]).find((s) =>
    JSON.stringify(s.Annotations ?? {}).includes('___')
  );
  it('maps id, duration, http and flags', () => {
    const r = normalizeSummary(withTool);
    expect(r.id).toBe(withTool.Id);
    expect(r.duration).toBe(withTool.Duration);
    expect(r.httpStatus).toBe(200);
    expect(r.httpMethod).toBe('POST');
    expect(r.hasFault).toBe(false);
    expect(r.hasError).toBe(false);
    expect(r.hasThrottle).toBe(false);
  });
  it('extracts the tool name from the span.name annotation', () => {
    expect(normalizeSummary(withTool).tool).toBe('you___you_search');
  });
  it('handles a summary with no http/annotations', () => {
    const r = normalizeSummary({ Id: 'x', StartTime: 1, Duration: 0.1 } as any);
    expect(r.id).toBe('x');
    expect(r.httpStatus).toBeNull();
    expect(r.tool).toBeNull();
    expect(r.hasFault).toBe(false);
  });
});

describe('buildSpanList', () => {
  const segments = (batchFixture.Traces as any[])[0].Segments;
  it('flattens segments and subsegments into spans', () => {
    expect(buildSpanList(segments).length).toBe(3);
  });
  it('computes durationMs from start/end and links parents', () => {
    const spans = buildSpanList(segments);
    const root = spans.find((s) => s.parentId === null)!;
    expect(root.kind).toBe('SERVER');
    expect(root.durationMs).toBeGreaterThan(0);
    const child = spans.find((s) => s.namespace === 'remote' && s.parentId);
    expect(child).toBeDefined();
    expect(spans.some((s) => s.id === child!.parentId)).toBe(true);
  });
  it('skips segments whose Document is not valid JSON', () => {
    expect(buildSpanList([{ Document: '{not json' }, ...segments]).length).toBe(3);
  });
  it('returns empty array for empty input', () => {
    expect(buildSpanList([])).toEqual([]);
    expect(buildSpanList(undefined)).toEqual([]);
  });

  it('enriches the root SERVER span from segment metadata', () => {
    const root = buildSpanList(segments).find((s) => s.kind === 'SERVER')!;
    expect(root.tool).toBe('you___you_search');
    expect(root.urlPath).toBe('tools/call');
    expect(root.latencyMs).toBe(1763);
    expect(root.overheadMs).toBe(97);
    expect(root.execMs).toBe(1666);
    expect(root.requestId).toBe('32da1938-630a-4de1-8718-7c488f0b6b2f');
    expect(root.httpStatus).toBe(200);
    expect(root.errorType).toBeNull();
    expect(root.error).toBe(false);
  });

  it('reads target.type / targetId off the CLIENT subsegment', () => {
    const client = buildSpanList(segments).find((s) => s.targetType)!;
    expect(client.targetType).toBe('LAMBDA');
    expect(client.targetId).toBe('JLVZLEREW7');
  });
});

describe('xrayIdToLogTraceId', () => {
  it('strips the version prefix and dashes to match the log trace_id', () => {
    expect(xrayIdToLogTraceId('1-6a1bfe57-1ef7c6b776c715de61df1014')).toBe(
      '6a1bfe571ef7c6b776c715de61df1014'
    );
  });
  it('returns null for a malformed id', () => {
    expect(xrayIdToLogTraceId('not-a-trace-id')).toBeNull();
    expect(xrayIdToLogTraceId('6a1bfe571ef7c6b776c715de61df1014')).toBeNull();
  });
});
