/**
 * AgentCore Evaluation `evaluate` 호출용 합성 OTel span 빌더.
 *
 * playground는 에이전트 trace가 아니라 엔진별 raw 검색 결과를 다룬다.
 * evaluate API의 sessionSpans는 document 타입이므로, "쿼리=입력 / 엔진 결과=출력"
 * 형태의 OpenInference LLM span을 엔진당 1개 만들어 보낸다. 응답의
 * context.spanContext.spanId 로 점수를 엔진에 되돌려 매핑한다.
 *
 * 주의: span attribute 키('input.value'/'output.value'/'openinference.span.kind')는
 * OpenInference 관례를 따른 것이며, 실제 built-in evaluator가 요구하는 정확한 키는
 * Task 4의 PoC 단계에서 실제 호출로 검증/보정한다.
 */

export interface JudgeResultItem {
  title?: string;
  url?: string;
  snippet?: string;
}

// 단일 세션·단일 trace로 묶는다(32 hex). 엔진 구분은 span 단위.
const TRACE_ID = '0'.repeat(31) + '1';

/** 인덱스 기반 16-hex span id (evaluate의 spanId 길이 제약 = 16). */
export function engineSpanId(index: number): string {
  return (index + 1).toString(16).padStart(16, '0');
}

export interface BuiltSpans {
  sessionSpans: unknown[];
  spanIdByEngine: Record<string, string>;
}

export function buildSessionSpans(
  query: string,
  engines: Record<string, JudgeResultItem[]>,
): BuiltSpans {
  const spanIdByEngine: Record<string, string> = {};
  const sessionSpans = Object.entries(engines).map(([engine, results], i) => {
    const spanId = engineSpanId(i);
    spanIdByEngine[engine] = spanId;
    const output = results
      .map((r, n) => `${n + 1}. ${r.title ?? ''}\n${r.snippet ?? ''}\n${r.url ?? ''}`)
      .join('\n\n');
    return {
      name: `web_search.${engine}`,
      context: { trace_id: TRACE_ID, span_id: spanId },
      attributes: {
        'openinference.span.kind': 'LLM',
        'input.value': query,
        'output.value': output,
      },
    };
  });
  return { sessionSpans, spanIdByEngine };
}

interface EvalResultLike {
  value?: number;
  context?: { spanContext?: { spanId?: string } };
}

/** evaluate 응답(evaluationResults)을 spanId 기준으로 엔진→점수로 변환. */
export function mapScoresByEngine(
  evaluationResults: EvalResultLike[],
  spanIdByEngine: Record<string, string>,
): Record<string, number> {
  const engineBySpan: Record<string, string> = {};
  for (const [engine, span] of Object.entries(spanIdByEngine)) {
    engineBySpan[span] = engine;
  }
  const out: Record<string, number> = {};
  for (const r of evaluationResults) {
    const span = r.context?.spanContext?.spanId;
    if (span && engineBySpan[span] != null && typeof r.value === 'number') {
      out[engineBySpan[span]] = r.value;
    }
  }
  return out;
}
