import {
  type Adapter,
  type SearchOpts,
  type SearchResult,
  ErrorCode,
  SearchError
} from '@search-gateway/shared';

const URL_ = 'https://api.perplexity.ai/chat/completions';
const TIMEOUT_MS = 12_000;

export const perplexityAdapter: Adapter = {
  name: 'perplexity',
  category: 'web',
  requiresApiKey: true,

  async search(query: string, opts?: SearchOpts): Promise<SearchResult[]> {
    if (!query.trim()) {
      throw new SearchError(ErrorCode.INVALID_ARGUMENT, 'INVALID_ARGUMENT: query must be non-empty', { provider: 'perplexity' });
    }
    if (!opts?.apiKey) {
      throw new SearchError(ErrorCode.INTERNAL, 'INTERNAL: missing api key', { provider: 'perplexity' });
    }
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(URL_, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.apiKey}` },
        body: JSON.stringify({
          model: 'sonar',
          messages: [{ role: 'user', content: query }],
          return_citations: true
        }),
        signal: ac.signal
      });
      if (!res.ok) {
        throw new SearchError(ErrorCode.UPSTREAM_ERROR, `UPSTREAM_ERROR: perplexity ${res.status}`, { provider: 'perplexity' });
      }
      const data = (await res.json()) as {
        choices: Array<{ message: { citations?: Array<{ title: string; url: string; snippet?: string }> } }>;
      };
      const cites = data.choices[0]?.message?.citations ?? [];
      return cites.slice(0, opts?.topK ?? 10).map((c, i) => ({
        title: c.title,
        url: c.url,
        snippet: c.snippet ?? '',
        provider: 'perplexity',
        rank: i + 1
      }));
    } finally {
      clearTimeout(t);
    }
  }
};
