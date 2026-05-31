// Evaluation utilities for search results

export interface JaccardScores {
  [engine: string]: number;
}

export function calculateJaccardSimilarity(urls1: string[], urls2: string[]): number {
  const set1 = new Set(urls1);
  const set2 = new Set(urls2);

  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}

export function calculateDedupScores(engines: { [key: string]: string[] }): JaccardScores {
  const scores: JaccardScores = {};
  const engineNames = Object.keys(engines);

  if (engineNames.length < 2) {
    engineNames.forEach(engine => {
      scores[engine] = 1;
    });
    return scores;
  }

  // Calculate similarity to all other engines
  engineNames.forEach(engine => {
    const urls = engines[engine];
    const otherUrls = engineNames
      .filter(e => e !== engine)
      .flatMap(e => engines[e]);

    const similarity = calculateJaccardSimilarity(urls, otherUrls);
    // Lower similarity = higher dedup score (more unique)
    scores[engine] = 1 - similarity;
  });

  return scores;
}

export function calculateResponseSize(data: any): number {
  return JSON.stringify(data).length;
}

export function humanizeBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function humanizeLatency(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'ref', 'fbclid', 'gclid',
];

/** 비교용 URL 정규화: 소문자 host, hash 제거, trailing slash 제거, 알려진 tracking param(TRACKING_PARAMS)만 제거. 유효한 URL 가정 — 파싱 실패 시 fallback은 query string을 보존하지 않는다. */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    TRACKING_PARAMS.forEach((p) => u.searchParams.delete(p));
    const path = u.pathname.toLowerCase().replace(/\/+$/, '');
    const search = u.searchParams.toString();
    return `${u.protocol}//${u.host.toLowerCase()}${path}${search ? `?${search}` : ''}`;
  } catch {
    // 잘못된 URL fallback: trim·소문자·trailing slash 제거 (query string은 보존되지 않음).
    return url.trim().toLowerCase().replace(/\/+$/, '');
  }
}

/** 정규화된 URL별로 그것을 반환한 엔진 수를 센다(엔진당 1회). */
export function urlShareCounts(enginesUrls: Record<string, string[]>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const urls of Object.values(enginesUrls)) {
    const seen = new Set<string>();
    for (const raw of urls) {
      const n = normalizeUrl(raw);
      if (seen.has(n)) continue;
      seen.add(n);
      counts.set(n, (counts.get(n) ?? 0) + 1);
    }
  }
  return counts;
}

/** 엔진별 합의도: 그 엔진 결과 중 2개 이상 엔진이 공유한 URL의 비율(0~1). */
export function computeConsensus(enginesUrls: Record<string, string[]>): Record<string, number> {
  const counts = urlShareCounts(enginesUrls);
  const out: Record<string, number> = {};
  for (const [engine, urls] of Object.entries(enginesUrls)) {
    const norm = [...new Set(urls.map(normalizeUrl))];
    if (norm.length === 0) {
      out[engine] = 0;
      continue;
    }
    const shared = norm.filter((u) => (counts.get(u) ?? 0) >= 2).length;
    out[engine] = shared / norm.length;
  }
  return out;
}
