import {
  type Adapter,
  type SearchOpts,
  type SearchResult,
  ErrorCode,
  SearchError
} from '@search-gateway/shared';

const EXA_URL = 'https://api.exa.ai/search';
const TIMEOUT_MS = 8_000;

export const exaAdapter: Adapter = {
  name: 'exa',
  category: 'web',
  requiresApiKey: true,

  async search(query: string, opts?: SearchOpts): Promise<SearchResult[]> {
    if (!query.trim()) {
      throw new SearchError(ErrorCode.INVALID_ARGUMENT, 'INVALID_ARGUMENT: query must be non-empty', { provider: 'exa' });
    }
    if (!opts?.apiKey) {
      throw new SearchError(ErrorCode.INTERNAL, 'missing api key', { provider: 'exa' });
    }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(EXA_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': opts.apiKey },
        body: JSON.stringify({ query, numResults: opts?.topK ?? 10 }),
        signal: ac.signal
      });
      if (!res.ok) {
        throw new SearchError(ErrorCode.UPSTREAM_ERROR, `UPSTREAM_ERROR: exa ${res.status}`, { provider: 'exa' });
      }
      const data = (await res.json()) as { results: Array<{ title: string; url: string; text?: string; score?: number }> };
      return data.results.map((r, i) => ({
        title: r.title,
        url: r.url,
        snippet: r.text ?? '',
        score: r.score,
        provider: 'exa',
        rank: i + 1
      }));
    } finally {
      clearTimeout(timer);
    }
  }
};
