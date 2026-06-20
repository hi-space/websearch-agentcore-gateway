// 검색 품질 계산 메트릭 (LLM 불필요). 모두 순수 함수.

const DAY_MS = 86_400_000;

/**
 * 다양성: 고유 호스트네임 수 / 결과 수 (0~1). 사용 가능한 URL이 없으면 null.
 * 주의: 진짜 eTLD+1이 아니라 hostname 단위다. 정확한 eTLD+1은 public-suffix-list
 * 의존성이 필요해 playground 메트릭 범위 밖이라 hostname으로 근사한다.
 */
export function computeDiversity(urls: string[]): number | null {
  const hosts = new Set<string>();
  let usable = 0;
  for (const u of urls) {
    try {
      hosts.add(new URL(u).hostname.toLowerCase());
      usable += 1;
    } catch {
      // 파싱 불가 URL은 건너뛴다.
    }
  }
  if (usable === 0) return null;
  return hosts.size / usable;
}

export interface FreshnessResult {
  score: number | null; // null = 날짜 데이터 없음(측정 불가)
  dated: number;         // published_at 파싱 성공 건수
  total: number;         // 전체 결과 건수
}

function ageToScore(ageDays: number): number {
  if (ageDays <= 7) return 1.0;
  if (ageDays <= 30) return 0.8;
  if (ageDays <= 365) return 0.5;
  if (ageDays <= 1095) return 0.2;
  return 0;
}

/**
 * 최신성: 파싱 가능한 published_at들의 나이 중앙값(median)을 구간 점수화(0~1).
 * 파싱 가능한 날짜가 하나도 없으면 score=null. now는 테스트 주입용.
 */
export function computeFreshness(
  publishedAts: Array<string | undefined>,
  now: number,
): FreshnessResult {
  const total = publishedAts.length;
  const ages: number[] = [];
  for (const p of publishedAts) {
    if (!p) continue;
    const ts = Date.parse(p);
    if (Number.isNaN(ts)) continue;
    ages.push(Math.max(0, (now - ts) / DAY_MS));
  }
  if (ages.length === 0) return { score: null, dated: 0, total };
  ages.sort((a, b) => a - b);
  const mid = Math.floor(ages.length / 2);
  const median = ages.length % 2 === 0 ? (ages[mid - 1] + ages[mid]) / 2 : ages[mid];
  return { score: ageToScore(median), dated: ages.length, total };
}

// 종합 점수 가중치(LLM 평가 2축만). relevance 중심 — 검색 품질의 핵심은 의도 일치,
// authority는 출처 신뢰도. diversity(authority와 충돌 가능)·freshness(쿼리 의존적,
// published_at이 자주 null)는 신호가 약해 총점에서 제외하고 컬럼으로만 표시한다.
export const QUALITY_WEIGHTS = {
  relevance: 0.6,
  authority: 0.4,
} as const;

export type QualityAxis = keyof typeof QUALITY_WEIGHTS;

// 종합에 반영되는 전체 축 수(가중치 키 개수). UI가 부분 반영 여부를 판단할 때 쓴다.
export const QUALITY_AXIS_COUNT = Object.keys(QUALITY_WEIGHTS).length;

/**
 * 품질 축(relevance·authority, 각 0~1)의 가중 평균으로 종합 점수(0~1)를 낸다.
 * 측정 불가(null/undefined)인 축은 빼고 **남은 축의 가중치를 재정규화**한다 —
 * 예: authority가 null이면 relevance 단독 점수가 된다. 사용 가능한 축이 하나도
 * 없으면 null(총점 표시 불가).
 *
 * coverage = 종합에 실제로 반영된 축 수. 일부 축만 반영됐을 때 UI가 신뢰도를
 * 함께 보여줄 수 있도록 돌려준다.
 */
export interface CompositeScore {
  score: number | null;
  coverage: number; // 0~QUALITY_AXIS_COUNT: 종합에 반영된 축 수
}

export function computeComposite(
  axes: Partial<Record<QualityAxis, number | null | undefined>>,
): CompositeScore {
  let weighted = 0;
  let weightSum = 0;
  let coverage = 0;
  for (const axis of Object.keys(QUALITY_WEIGHTS) as QualityAxis[]) {
    const v = axes[axis];
    if (typeof v !== 'number' || Number.isNaN(v)) continue;
    const w = QUALITY_WEIGHTS[axis];
    weighted += v * w;
    weightSum += w;
    coverage += 1;
  }
  if (weightSum === 0) return { score: null, coverage: 0 };
  return { score: weighted / weightSum, coverage };
}
