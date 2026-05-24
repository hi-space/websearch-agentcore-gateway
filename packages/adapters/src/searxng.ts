import {
  type Adapter,
  type SearchOpts,
  type SearchResult,
  ErrorCode,
  SearchError
} from '@search-gateway/shared';

const TIMEOUT_MS = 8_000;

export const searxngAdapter: Adapter = {
  name: 'searxng',
  category: 'web',
  requiresApiKey: false,

  async search(query: string, opts?: SearchOpts): Promise<SearchResult[]> {
    if (!query || query.trim().length === 0) {
      throw new SearchError(ErrorCode.INVALID_ARGUMENT, 'query must be non-empty', {
        provider: 'searxng'
      });
    }

    const baseUrl = opts?.baseUrl;
    if (!baseUrl) {
      throw new SearchError(ErrorCode.INTERNAL, 'baseUrl is required for searxng', {
        provider: 'searxng'
      });
    }

    const max = opts?.topK ?? 10;
    const url = new URL('/search', baseUrl);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, { signal: ac.signal });
    } catch (e) {
      clearTimeout(timer);
      if ((e as Error).name === 'AbortError') {
        throw new SearchError(ErrorCode.UPSTREAM_TIMEOUT, 'searxng request timed out', {
          provider: 'searxng'
        });
      }
      throw new SearchError(ErrorCode.UPSTREAM_ERROR, 'searxng fetch failed', {
        provider: 'searxng',
        cause: e
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      throw new SearchError(ErrorCode.UPSTREAM_ERROR, `searxng ${res.status}`, {
        provider: 'searxng'
      });
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch (e) {
      throw new SearchError(ErrorCode.UPSTREAM_ERROR, 'searxng response parsing failed', {
        provider: 'searxng',
        cause: e
      });
    }

    const parsed = body as { results?: Array<{ title?: string; url?: string; content?: string }> };
    const results = parsed.results ?? [];

    return results
      .slice(0, max)
      .filter((r): r is typeof r & { url: string } => typeof r.url === 'string' && r.url.length > 0)
      .map((r) => ({
        url: r.url,
        title: (r.title ?? '').trim(),
        snippet: (r.content ?? '').trim(),
        source: 'searxng'
      }));
  }
};
