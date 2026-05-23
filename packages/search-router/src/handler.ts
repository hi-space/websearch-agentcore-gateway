import { z } from 'zod';
import {
  type Adapter,
  type SearchResult,
  ErrorCode,
  SearchError,
  createLogger,
  emitMetric
} from '@search-gateway/shared';
import type { QuotaService, QuotaLimits } from './quota.js';

export interface RouterEvent {
  toolName: string;
  arguments: unknown;
}

export type RouterResult =
  | { results: SearchResult[]; providersUsed: string[] }
  | { error: { code: string; message: string; provider?: string; retryAfterSec?: number } };

const ArgsSchema = z.object({ query: z.string().min(1).max(2048) });

export interface HandlerDeps {
  adapters: Record<string, Adapter>;
  quota: QuotaService;
  limits: Record<string, QuotaLimits>;
  secrets?: { get(arn: string): Promise<string> };
  secretArns?: Record<string, string>;
}

export function createHandler(deps: HandlerDeps) {
  const log = createLogger({ component: 'search-router' });

  return async function handler(event: RouterEvent): Promise<RouterResult> {
    const start = Date.now();
    const tool = event.toolName;
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

      let secret: string | undefined;
      if (adapter.requiresApiKey) {
        const arn = deps.secretArns?.[provider];
        if (!arn || !deps.secrets) {
          throw new SearchError(ErrorCode.INTERNAL, `missing secret for ${provider}`, { provider });
        }
        secret = await deps.secrets.get(arn);
      }

      const results = await adapter.search(parsed.query, undefined, secret);

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
