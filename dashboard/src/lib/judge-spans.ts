/**
 * AgentCore Evaluation `evaluate` 호출용 합성 OTel span 빌더.
 *
 * playground는 에이전트 trace가 아니라 엔진별 raw 검색 결과를 다룬다.
 * evaluate API의 sessionSpans는 document 타입이므로, "쿼리=입력 / 엔진 결과=출력"
 * 형태의 OpenInference span을 엔진당 1개 만들어 보낸다.
 *
 * 아래 span 형태는 us-east-1 라이브 evaluate 호출로 검증한 것이다:
 *  - start_time / end_time 는 ISO-8601 문자열이어야 한다(unixNano는 거부됨).
 *  - scope.name 은 지원 scope여야 한다('openinference.instrumentation.langchain').
 *  - openinference.span.kind 는 'AGENT'여야 평가 대상으로 인정된다
 *    (LLM/CHAIN은 "no spans with model/tool/agent invocation details"로 거부).
 *  - 엔진별 점수를 따로 받으려면 엔진마다 trace_id를 분리해야 한다. 한 trace에
 *    여러 span을 넣으면 evaluator가 세션 하나로 합쳐 결과를 1개만 돌려준다.
 *  - 응답은 context.spanContext.traceId 로 돌아오므로 trace_id 로 역매핑한다.
 */

export interface JudgeResultItem {
  title?: string;
  url?: string;
  snippet?: string;
}

// 지원되는 instrumentation scope (라이브 검증). strands / langchain 계열만 허용된다.
const SUPPORTED_SCOPE = 'openinference.instrumentation.langchain';

/** 인덱스 기반 32-hex trace id. 엔진마다 분리해야 결과가 엔진별로 1개씩 돌아온다. */
export function engineTraceId(index: number): string {
  return (index + 1).toString(16).padStart(32, '0');
}

/** 인덱스 기반 16-hex span id (span 식별용, evaluate의 span_id 길이 제약 = 16). */
export function engineSpanId(index: number): string {
  return (index + 1).toString(16).padStart(16, '0');
}

export interface BuiltSpans {
  sessionSpans: unknown[];
  engineByTraceId: Record<string, string>;
}

export function buildSessionSpans(
  query: string,
  engines: Record<string, JudgeResultItem[]>,
  // 합성 span의 타임스탬프(테스트에서 결정적 값 주입용). 미지정 시 호출 시각.
  now: number = Date.now(),
): BuiltSpans {
  const endIso = new Date(now).toISOString();
  const startIso = new Date(now - 1000).toISOString();
  const engineByTraceId: Record<string, string> = {};
  const sessionSpans = Object.entries(engines).map(([engine, results], i) => {
    const traceId = engineTraceId(i);
    engineByTraceId[traceId] = engine;
    const output = results
      .map((r, n) => `${n + 1}. ${r.title ?? ''}\n${r.snippet ?? ''}\n${r.url ?? ''}`)
      .join('\n\n');
    return {
      name: `web_search.${engine}`,
      context: { trace_id: traceId, span_id: engineSpanId(i) },
      start_time: startIso,
      end_time: endIso,
      scope: { name: SUPPORTED_SCOPE },
      attributes: {
        'openinference.span.kind': 'AGENT',
        'input.value': query,
        'output.value': output,
      },
    };
  });
  return { sessionSpans, engineByTraceId };
}

interface EvalResultLike {
  value?: number;
  label?: string;
  explanation?: string;
  context?: { spanContext?: { traceId?: string } };
}

export interface AxisScore {
  value: number;
  label: string | null;
  explanation: string | null;
}

/** evaluate 응답(evaluationResults)을 traceId 기준으로 엔진→{점수,라벨,근거}로 변환. */
export function mapResultsByEngine(
  evaluationResults: EvalResultLike[],
  engineByTraceId: Record<string, string>,
): Record<string, AxisScore> {
  const out: Record<string, AxisScore> = {};
  for (const r of evaluationResults) {
    const trace = r.context?.spanContext?.traceId;
    const engine = trace ? engineByTraceId[trace] : undefined;
    if (engine != null && typeof r.value === 'number') {
      out[engine] = {
        value: r.value,
        label: r.label ?? null,
        explanation: r.explanation ?? null,
      };
    }
  }
  return out;
}
