import { mergeRRF, type Adapter, type SearchResult } from '@search-gateway/shared';

export interface UnifiedInput {
  query: string;
  topK?: number;
  lambdaAdapters: Record<string, Adapter>;
  builtinTools: string[];
  callBuiltin: (tool: string, query: string, topK?: number) => Promise<SearchResult[]>;
  apiKeys?: Record<string, string>;
}

export interface UnifiedOutput {
  results: SearchResult[];
  providersUsed: string[];
  errors: Array<{ provider: string; message: string }>;
}

export async function runUnified(input: UnifiedInput): Promise<UnifiedOutput> {
  const calls: Array<Promise<{ provider: string; results?: SearchResult[]; error?: string }>> = [];
  for (const [name, adapter] of Object.entries(input.lambdaAdapters)) {
    calls.push(
      adapter
        .search(input.query, { topK: input.topK, apiKey: input.apiKeys?.[name] })
        .then((results) => ({ provider: name, results }))
        .catch((e: Error) => ({ provider: name, error: e.message }))
    );
  }
  for (const tool of input.builtinTools) {
    const provider = tool.replace(/^search_/, '');
    calls.push(
      input
        .callBuiltin(tool, input.query, input.topK)
        .then((results) => ({ provider, results }))
        .catch((e: Error) => ({ provider, error: e.message }))
    );
  }
  const settled = await Promise.all(calls);
  const lists = settled.filter((s) => s.results).map((s) => s.results!);
  const used = settled.filter((s) => s.results).map((s) => s.provider);
  const errors = settled.filter((s) => s.error).map((s) => ({ provider: s.provider, message: s.error! }));
  return { results: mergeRRF(lists, { topK: input.topK }), providersUsed: used, errors };
}
