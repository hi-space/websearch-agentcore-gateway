import { describe, it, expect } from 'vitest';
import { engineSpanId, buildSessionSpans, mapScoresByEngine } from './judge-spans';

describe('engineSpanId', () => {
  it('produces a 16-char hex span id per index', () => {
    expect(engineSpanId(0)).toHaveLength(16);
    expect(engineSpanId(0)).not.toBe(engineSpanId(1));
  });
});

describe('buildSessionSpans', () => {
  it('builds one span per engine with input=query and output text, mapped by spanId', () => {
    const { sessionSpans, spanIdByEngine } = buildSessionSpans('best llm', {
      exa: [{ title: 'A', url: 'https://a', snippet: 's' }],
      ddg: [{ title: 'B', url: 'https://b', snippet: 't' }],
    });
    expect(sessionSpans).toHaveLength(2);
    expect(Object.keys(spanIdByEngine)).toEqual(['exa', 'ddg']);
    const exaSpan = sessionSpans[0] as { context: { span_id: string }; attributes: Record<string, string> };
    expect(exaSpan.context.span_id).toBe(spanIdByEngine.exa);
    expect(exaSpan.attributes['input.value']).toBe('best llm');
    expect(exaSpan.attributes['output.value']).toContain('A');
  });
});

describe('mapScoresByEngine', () => {
  it('maps evaluation results back to engines via spanId', () => {
    const { spanIdByEngine } = buildSessionSpans('q', { exa: [], ddg: [] });
    const scores = mapScoresByEngine(
      [
        { value: 0.9, context: { spanContext: { spanId: spanIdByEngine.exa } } },
        { value: 0.4, context: { spanContext: { spanId: spanIdByEngine.ddg } } },
        { value: 0.1, context: { spanContext: { spanId: 'unknownspanid000' } } },
      ],
      spanIdByEngine,
    );
    expect(scores).toEqual({ exa: 0.9, ddg: 0.4 });
  });
});
