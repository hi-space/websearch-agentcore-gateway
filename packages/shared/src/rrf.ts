import type { SearchResult } from './types.js';

export interface MergeOpts {
  k?: number | undefined;
  topK?: number | undefined;
}

export function mergeRRF(lists: SearchResult[][], opts: MergeOpts = {}): SearchResult[] {
  const k = opts.k ?? 60;
  const byUrl = new Map<string, { result: SearchResult; score: number; providers: string[] }>();
  for (const list of lists) {
    list.forEach((r, i) => {
      const rank = r.rank ?? i + 1;
      const score = 1 / (k + rank);
      const cur = byUrl.get(r.url);
      if (cur) {
        cur.score += score;
        if (!cur.providers.includes(r.provider)) cur.providers.push(r.provider);
      } else {
        byUrl.set(r.url, { result: { ...r }, score, providers: [r.provider] });
      }
    });
  }
  const merged = Array.from(byUrl.values())
    .sort((a, b) => b.score - a.score)
    .map((e) => ({ ...e.result, score: e.score, provider: e.providers.join(',') }));
  return opts.topK ? merged.slice(0, opts.topK) : merged;
}
