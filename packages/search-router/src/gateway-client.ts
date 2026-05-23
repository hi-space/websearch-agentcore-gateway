import { ErrorCode, SearchError, type SearchResult } from '@search-gateway/shared';

export interface GatewayCall {
  gatewayUrl: string;
  token: string;
  tool: string; // e.g., 'search_tavily'
  query: string;
  topK?: number | undefined;
}

type Fetch = typeof fetch;

export async function callGatewayBuiltin(
  call: GatewayCall,
  fetcher: Fetch = fetch
): Promise<SearchResult[]> {
  const provider = call.tool.replace(/^search_/, '');
  const res = await fetcher(call.gatewayUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${call.token}` },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: call.tool, arguments: { query: call.query, topK: call.topK ?? 10 } }
    })
  });
  if (!res.ok) {
    throw new SearchError(ErrorCode.UPSTREAM_ERROR, `UPSTREAM_ERROR: gateway ${res.status}`, { provider });
  }
  const data = (await res.json()) as {
    result?: { content?: Array<{ type: string; json?: { results: Array<{ title: string; url: string; snippet?: string }> } }> };
  };
  const items = data.result?.content?.[0]?.json?.results ?? [];
  return items.map((r, i) => ({
    title: r.title,
    url: r.url,
    snippet: r.snippet ?? '',
    provider,
    rank: i + 1
  }));
}
