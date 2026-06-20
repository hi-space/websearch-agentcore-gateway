import { describe, it, expect } from 'vitest';
import { engineSpanId, engineTraceId, buildSessionSpans, mapResultsByEngine } from './judge-spans';

describe('engineTraceId / engineSpanId', () => {
  it('produces a 32-char hex trace id, distinct per index', () => {
    expect(engineTraceId(0)).toHaveLength(32);
    expect(engineTraceId(0)).not.toBe(engineTraceId(1));
  });

  it('produces a 16-char hex span id per index', () => {
    expect(engineSpanId(0)).toHaveLength(16);
    expect(engineSpanId(0)).not.toBe(engineSpanId(1));
  });
});

describe('buildSessionSpans', () => {
  it('builds one span per engine with a distinct trace, AGENT kind, ISO times, supported scope', () => {
    const now = Date.parse('2026-06-20T00:00:00.000Z');
    const { sessionSpans, engineByTraceId } = buildSessionSpans(
      'best llm',
      {
        exa: [{ title: 'A', url: 'https://a', snippet: 's' }],
        ddg: [{ title: 'B', url: 'https://b', snippet: 't' }],
      },
      now,
    );
    expect(sessionSpans).toHaveLength(2);

    const exaSpan = sessionSpans[0] as {
      context: { trace_id: string };
      start_time: string;
      end_time: string;
      scope: { name: string };
      attributes: Record<string, string>;
    };
    // 엔진마다 trace를 분리해야 결과가 엔진별로 1개씩 돌아온다.
    expect(engineByTraceId[exaSpan.context.trace_id]).toBe('exa');
    expect(exaSpan.attributes['openinference.span.kind']).toBe('AGENT');
    expect(exaSpan.attributes['input.value']).toBe('best llm');
    expect(exaSpan.attributes['output.value']).toContain('A');
    // 타임스탬프는 ISO-8601 문자열이어야 한다(unixNano는 거부됨).
    expect(exaSpan.start_time).toBe('2026-06-19T23:59:59.000Z');
    expect(exaSpan.end_time).toBe('2026-06-20T00:00:00.000Z');
    expect(exaSpan.scope.name).toBe('openinference.instrumentation.langchain');

    // 두 엔진의 trace_id는 서로 달라야 한다.
    const traces = sessionSpans.map((s) => (s as { context: { trace_id: string } }).context.trace_id);
    expect(new Set(traces).size).toBe(2);
  });

  it('skips engines with no results so an empty span cannot poison the evaluate call', () => {
    const { sessionSpans, engineByTraceId } = buildSessionSpans('q', {
      good: [{ title: 'A', url: 'https://a', snippet: 's' }],
      empty: [],
      blank: [{ title: '', url: '', snippet: '' }],
    });
    // 빈 결과 엔진은 span을 만들지 않는다(평가 안 됨으로 남는다).
    expect(sessionSpans).toHaveLength(1);
    expect(Object.values(engineByTraceId)).toEqual(['good']);
  });
});

describe('mapResultsByEngine', () => {
  it('maps value, label and explanation back to engines via traceId', () => {
    const { engineByTraceId } = buildSessionSpans('q', { exa: [{ title: 'x' }], ddg: [{ title: 'y' }] });
    const [exaTrace, ddgTrace] = Object.keys(engineByTraceId);
    const out = mapResultsByEngine(
      [
        { value: 0.9, label: 'Excellent', explanation: 'spot on', context: { spanContext: { traceId: exaTrace } } },
        { value: 0.4, context: { spanContext: { traceId: ddgTrace } } },
        { value: 0.1, context: { spanContext: { traceId: 'ffffffffffffffffffffffffffffffff' } } },
      ],
      engineByTraceId,
    );
    expect(out.exa).toEqual({ value: 0.9, label: 'Excellent', explanation: 'spot on' });
    expect(out.ddg).toEqual({ value: 0.4, label: null, explanation: null });
    expect(out.unknown).toBeUndefined();
  });

  it('maps partial failures (errorCode, no value) to value=null with the error preserved', () => {
    const { engineByTraceId } = buildSessionSpans('q', { exa: [{ title: 'x' }], ddg: [{ title: 'y' }] });
    const [exaTrace, ddgTrace] = Object.keys(engineByTraceId);
    const out = mapResultsByEngine(
      [
        { value: 0.9, context: { spanContext: { traceId: exaTrace } } },
        {
          errorCode: 'LogEventMissingException',
          errorMessage: 'Session span data is incomplete',
          context: { spanContext: { traceId: ddgTrace } },
        },
      ],
      engineByTraceId,
    );
    expect(out.exa.value).toBe(0.9);
    expect(out.ddg).toEqual({
      value: null,
      label: null,
      explanation: 'Session span data is incomplete',
      error: 'LogEventMissingException',
    });
  });
});
