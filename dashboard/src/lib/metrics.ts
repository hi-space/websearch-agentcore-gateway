import { computeConsensus } from './eval';

export type Axis = 'latency' | 'quality' | 'consensus' | 'count';

export interface EngineResultItem {
  title?: string;
  url?: string;
  snippet?: string;
  score?: number;
  published_at?: string;
  favicon?: string;
}

export interface EngineResult {
  results?: EngineResultItem[];
  answer?: string;  // 일부 엔진(Anthropic, Tavily)이 합성한 직접 답변. 없을 수 있음.
  latency_ms?: number;
  isError?: boolean;
  error?: string;
}

export interface EngineMetrics {
  engine: string;
  latencyMs: number | null;
  resultCount: number;
  consensus: number;       // 0..1
  quality: number | null;  // judge 점수, 미실행 시 null
  hasError: boolean;
}

export function deriveMetrics(
  results: Record<string, EngineResult>,
  quality: Record<string, number> | null,
): EngineMetrics[] {
  const urls: Record<string, string[]> = {};
  for (const [engine, r] of Object.entries(results)) {
    if (Array.isArray(r.results)) {
      urls[engine] = r.results.map((x) => x.url ?? '').filter(Boolean);
    }
  }
  const consensus = computeConsensus(urls);

  return Object.entries(results).map(([engine, r]) => {
    const hasError = !!r.isError || !!r.error || !Array.isArray(r.results);
    return {
      engine,
      latencyMs: typeof r.latency_ms === 'number' ? r.latency_ms : null,
      resultCount: Array.isArray(r.results) ? r.results.length : 0,
      consensus: consensus[engine] ?? 0,
      quality: quality?.[engine] ?? null,
      hasError,
    };
  });
}

export interface ScoreboardBar {
  engine: string;
  fraction: number;        // 0..1 막대 길이
  value: number | null;    // 해당 축의 원값
  isBest: boolean;
  hasError: boolean;
}

function axisValue(m: EngineMetrics, axis: Axis): number | null {
  switch (axis) {
    case 'latency': return m.latencyMs;
    case 'quality': return m.quality;
    case 'consensus': return m.consensus;
    case 'count': return m.resultCount;
    default: throw new Error(`Unknown axis: ${axis}`);
  }
}

export function scoreboardBars(metrics: EngineMetrics[], axis: Axis): ScoreboardBar[] {
  const lowerIsBetter = axis === 'latency';
  const valid = metrics.filter((m) => !m.hasError && axisValue(m, axis) !== null);
  const values = valid.map((m) => axisValue(m, axis) as number);
  const max = values.length ? Math.max(...values) : 0;
  const min = values.length ? Math.min(...values) : 0;
  const best = lowerIsBetter ? min : max;

  // 동점이면 여러 엔진이 isBest=true가 될 수 있다(의도된 동작) — UI는 모두 강조 처리.
  return metrics.map((m) => {
    const v = axisValue(m, axis);
    if (m.hasError || v === null) {
      return { engine: m.engine, fraction: 0, value: v, isBest: false, hasError: m.hasError };
    }
    let fraction: number;
    if (lowerIsBetter) {
      fraction = v === 0 ? 1 : min / v;        // 가장 빠른 엔진 = 가장 긴 막대
    } else {
      fraction = max === 0 ? 0 : v / max;      // 가장 큰 값 = 가장 긴 막대
    }
    return { engine: m.engine, fraction, value: v, isBest: v === best, hasError: false };
  });
}
