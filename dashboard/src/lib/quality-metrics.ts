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
