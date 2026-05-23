import { z } from 'zod';
import {
  type Adapter,
  type SearchResult,
  type SearchOpts,
  ErrorCode,
  SearchError,
  createLogger,
  emitMetric
} from '@search-gateway/shared';
import type { QuotaService, QuotaLimits } from './quota.js';
import { runUnified } from './unified.js';

export interface RouterEvent {
  toolName: string;
  arguments: unknown;
}

export type RouterResult =
  | { results: SearchResult[]; providersUsed: string[] }
  | { error: { code: string; message: string; provider?: string; retryAfterSec?: number } };

const ArgsSchema = z.object({ query: z.string().min(1).max(2048) });
const UnifiedArgsSchema = z.object({
  query: z.string().min(1).max(2048),
  topK: z.number().int().positive().max(50).optional()
});

export interface HandlerDeps {
  adapters: Record<string, Adapter>;
  quota: QuotaService;
  limits: Record<string, QuotaLimits>;
  secrets?: { get(arn: string): Promise<string> } | undefined;
  secretArns?: Record<string, string> | undefined;
  unified?: {
    builtinTools: string[];
    callBuiltin: (tool: string, query: string, topK?: number | undefined) => Promise<SearchResult[]>;
    apiKeys?: Record<string, string> | undefined;
  } | undefined;
}

export function createHandler(deps: HandlerDeps) {
  const log = createLogger({ component: 'search-router' });

  return async function handler(event: RouterEvent): Promise<RouterResult> {
    const start = Date.now();
    const tool = event.toolName;

    if (tool === 'search_unified') {
      if (!deps.unified) {
        const err = new SearchError(ErrorCode.INTERNAL, 'unified not configured');
        return { error: err.toJSON() as { code: string; message: string; provider?: string; retryAfterSec?: number } };
      }
      let unifiedArgs;
      try {
        unifiedArgs = UnifiedArgsSchema.parse(event.arguments);
      } catch {
        const err = new SearchError(ErrorCode.INVALID_ARGUMENT, 'invalid arguments');
        return { error: err.toJSON() as { code: string; message: string; provider?: string; retryAfterSec?: number } };
      }
      const out = await runUnified({
        query: unifiedArgs.query,
        topK: unifiedArgs.topK,
        lambdaAdapters: deps.adapters,
        builtinTools: deps.unified.builtinTools,
        callBuiltin: deps.unified.callBuiltin,
        apiKeys: deps.unified.apiKeys
      });

      for (const provider of out.providersUsed) {
        emitMetric({
          namespace: 'SearchGateway',
          dimensions: { Provider: provider, Status: 'Ok', Source: 'unified' },
          metrics: { Invocations: 1 },
          unit: { Invocations: 'Count' }
        });
      }
      for (const e of out.errors) {
        log.error('unified leg failed', { provider: e.provider });
        emitMetric({
          namespace: 'SearchGateway',
          dimensions: { Provider: e.provider, Status: 'Error', Source: 'unified' },
          metrics: { Invocations: 1, Errors: 1 },
          unit: { Invocations: 'Count' }
        });
      }
      emitMetric({
        namespace: 'SearchGateway',
        dimensions: { Provider: 'unified', Status: 'Ok' },
        metrics: {
          Invocations: 1,
          LatencyMs: Date.now() - start,
          ResultCount: out.results.length,
          ProvidersUsed: out.providersUsed.length
        },
        unit: { LatencyMs: 'Milliseconds', Invocations: 'Count', ResultCount: 'Count', ProvidersUsed: 'Count' }
      });

      return { results: out.results, providersUsed: out.providersUsed };
    }

    const provider = tool.replace(/^search_/, '');
    const adapter = deps.adapters[provider];

    if (!tool.startsWith('search_') || !adapter) {
      const err = new SearchError(ErrorCode.INVALID_ARGUMENT, `unknown tool: ${tool}`);
      return { error: err.toJSON() as { code: string; message: string; provider?: string; retryAfterSec?: number } };
    }
    const limits = deps.limits[provider];
    if (!limits) {
      const err = new SearchError(ErrorCode.INTERNAL, `no quota limits for ${provider}`, { provider });
      return { error: err.toJSON() as { code: string; message: string; provider?: string; retryAfterSec?: number } };
    }

    let parsed;
    try {
      parsed = ArgsSchema.parse(event.arguments);
    } catch {
      const err = new SearchError(ErrorCode.INVALID_ARGUMENT, 'invalid arguments', { provider });
      return { error: err.toJSON() as { code: string; message: string; provider?: string; retryAfterSec?: number } };
    }

    try {
      await deps.quota.consume(provider, limits);

      let opts: SearchOpts | undefined;
      if (adapter.requiresApiKey) {
        const arn = deps.secretArns?.[provider];
        if (!arn || !deps.secrets) {
          throw new SearchError(ErrorCode.INTERNAL, `missing secret for ${provider}`, { provider });
        }
        const secret = await deps.secrets.get(arn);
        opts = { topK: 10, apiKey: secret };
      }

      const results = await adapter.search(parsed.query, opts);

      emitMetric({
        namespace: 'SearchGateway',
        dimensions: { Provider: provider, Status: 'Ok' },
        metrics: { Invocations: 1, LatencyMs: Date.now() - start, ResultCount: results.length },
        unit: { LatencyMs: 'Milliseconds', Invocations: 'Count', ResultCount: 'Count' }
      });

      return { results, providersUsed: [provider] };
    } catch (e) {
      const err = e instanceof SearchError
        ? e
        : new SearchError(ErrorCode.INTERNAL, (e as Error).message, { provider });
      log.error('search failed', { provider, code: err.code });
      emitMetric({
        namespace: 'SearchGateway',
        dimensions: { Provider: provider, Status: err.code },
        metrics: { Invocations: 1, Errors: 1, LatencyMs: Date.now() - start },
        unit: { LatencyMs: 'Milliseconds' }
      });
      return { error: err.toJSON() as { code: string; message: string; provider?: string; retryAfterSec?: number } };
    }
  };
}
