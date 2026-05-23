import { mergeRRF, type Adapter, type SearchResult } from '@search-gateway/shared';

export interface UnifiedInput {
  query: string;
  topK?: number | undefined;
  lambdaAdapters: Record<string, Adapter>;
  builtinTools: string[];
  callBuiltin: (tool: string, query: string, topK?: number | undefined) => Promise<SearchResult[]>;
  apiKeys?: Record<string, string> | undefined;
}

export interface UnifiedOutput {
  results: SearchResult[];
  providersUsed: string[];
  errors: Array<{ provider: string; message: string }>;
}

export async function runUnified(input: UnifiedInput): Promise<UnifiedOutput> {
  const calls: Array<Promise<{ provider: string; results?: SearchResult[]; error?: string }>> = [];
  for (const [name, adapter] of Object.entries(input.lambdaAdapters)) {
    const adapterOpts = {
      ...(input.topK !== undefined ? { topK: input.topK } : {}),
      ...(input.apiKeys?.[name] !== undefined ? { apiKey: input.apiKeys[name] } : {})
    };
    calls.push(
      adapter
        .search(input.query, adapterOpts as Parameters<typeof adapter.search>[1])
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
  const mergeOpts = {
    ...(input.topK !== undefined ? { topK: input.topK } : {})
  };
  return { results: mergeRRF(lists, mergeOpts as Parameters<typeof mergeRRF>[1]), providersUsed: used, errors };
}
