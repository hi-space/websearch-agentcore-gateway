import {
  type Adapter,
  type SearchOpts,
  type SearchResult,
  ErrorCode,
  SearchError
} from '@search-gateway/shared';

const BASE = 'https://api.ydc-index.io/search';
const TIMEOUT_MS = 8_000;

export const youAdapter: Adapter = {
  name: 'you',
  category: 'web',
  requiresApiKey: true,

  async search(query: string, opts?: SearchOpts): Promise<SearchResult[]> {
    if (!query.trim()) {
      throw new SearchError(ErrorCode.INVALID_ARGUMENT, 'INVALID_ARGUMENT: query must be non-empty', { provider: 'you' });
    }
    if (!opts?.apiKey) {
      throw new SearchError(ErrorCode.INTERNAL, 'INTERNAL: missing api key', { provider: 'you' });
    }
    const url = new URL(BASE);
    url.searchParams.set('query', query);
    url.searchParams.set('num_web_results', String(opts?.topK ?? 10));
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { headers: { 'X-API-Key': opts.apiKey }, signal: ac.signal });
      if (!res.ok) {
        throw new SearchError(ErrorCode.UPSTREAM_ERROR, `UPSTREAM_ERROR: you ${res.status}`, { provider: 'you' });
      }
      const data = (await res.json()) as { hits: Array<{ title: string; url: string; description?: string }> };
      return data.hits.map((h, i) => ({
        title: h.title,
        url: h.url,
        snippet: h.description ?? '',
        provider: 'you',
        rank: i + 1
      }));
    } finally {
      clearTimeout(t);
    }
  }
};
