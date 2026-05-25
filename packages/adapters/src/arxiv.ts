import { XMLParser } from 'fast-xml-parser';
import {
  type Adapter,
  type SearchOpts,
  type SearchResult,
  ErrorCode,
  SearchError
} from '@search-gateway/shared';

const ARXIV_BASE = 'https://export.arxiv.org/api/query';
const TIMEOUT_MS = 8_000;

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'entry' || name === 'author'
});

export const arxivAdapter: Adapter = {
  name: 'arxiv',
  category: 'academic',
  requiresApiKey: false,

  async search(query: string, opts?: SearchOpts): Promise<SearchResult[]> {
    if (!query || query.trim().length === 0) {
      throw new SearchError(ErrorCode.INVALID_ARGUMENT, 'query must be non-empty', {
        provider: 'arxiv'
      });
    }
    const max = opts?.topK ?? 10;
    const url = new URL(ARXIV_BASE);
    url.searchParams.set('search_query', `all:${query}`);
    url.searchParams.set('start', '0');
    url.searchParams.set('max_results', String(max));

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        signal: ac.signal,
        headers: {
          'User-Agent': 'search-agentcore-gateway/1.0 (+https://github.com/hi-space/search-agentcore-gateway)',
          Accept: 'application/atom+xml'
        }
      });
    } catch (e) {
      const err = e as Error & { cause?: unknown };
      if (err.name === 'AbortError') {
        throw new SearchError(ErrorCode.UPSTREAM_TIMEOUT, `arxiv request timed out: ${err.message} cause=${JSON.stringify(err.cause)}`, {
          provider: 'arxiv'
        });
      }
      throw new SearchError(ErrorCode.UPSTREAM_ERROR, `arxiv fetch failed: ${err.message}`, {
        provider: 'arxiv', cause: e
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401 || res.status === 403) {
      throw new SearchError(ErrorCode.UPSTREAM_AUTH, `arxiv ${res.status}`, {
        provider: 'arxiv'
      });
    }
    if (res.status === 429) {
      throw new SearchError(ErrorCode.UPSTREAM_RATE_LIMITED, 'arxiv 429', {
        provider: 'arxiv'
      });
    }
    if (!res.ok) {
      throw new SearchError(ErrorCode.UPSTREAM_ERROR, `arxiv ${res.status}`, {
        provider: 'arxiv'
      });
    }

    const body = await res.text();
    const parsed = xml.parse(body) as {
      feed?: { entry?: Array<{ id?: string; title?: string; summary?: string; published?: string }> };
    };
    const entries = parsed.feed?.entry ?? [];
    return entries
      .filter((e): e is typeof e & { id: string } => typeof e.id === 'string' && e.id.length > 0)
      .map((e) => ({
        url: e.id,
        title: (e.title ?? '').trim(),
        snippet: (e.summary ?? '').trim(),
        provider: 'arxiv',
        ...(e.published ? { publishedAt: e.published } : {})
      }));
  }
};
