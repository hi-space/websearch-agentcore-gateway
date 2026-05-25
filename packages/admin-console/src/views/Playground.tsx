'use client';

import React, { useState } from 'react';
import { Card, CardHeader } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { ApiError } from '../lib/api';

interface PlaygroundResult {
  title: string;
  url: string;
  snippet?: string;
  score?: number;
  source?: string;
}

interface PlaygroundResponse {
  query: string;
  results: PlaygroundResult[];
  providersUsed: string[];
  errors: Array<{ provider: string; message: string }>;
  latencyMs: number;
}

interface PlaygroundDeps {
  search: (query: string, topK?: number) => Promise<PlaygroundResponse>;
}

export function Playground({ api }: { api: PlaygroundDeps }) {
  const [query, setQuery] = useState('');
  const [topK, setTopK] = useState(10);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<PlaygroundResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const out = await api.search(query.trim(), topK);
      setResponse(out);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : (err as Error).message;
      setError(code || 'INTERNAL');
      setResponse(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card variant="panel">
        <CardHeader
          title="Run unified search"
          subtitle="Fan-out across every enabled provider, then merge with Reciprocal Rank Fusion (k=60)."
        />
        <form onSubmit={onSubmit} className="space-y-5" data-testid="playground-form">
          <label className="block">
            <span className="text-body-sm-medium text-onBackground">Query</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. retrieval augmented generation evaluation"
              className="mt-2 w-full rounded-xl border border-outline bg-surface px-4 h-12 text-body-md text-onBackground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors"
              maxLength={2048}
              required
              data-testid="playground-query"
            />
          </label>
          <label className="block max-w-xs">
            <span className="text-body-sm-medium text-onBackground">Top-K per provider</span>
            <div className="mt-2 flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={50}
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value))}
                className="flex-1 accent-primary"
                data-testid="playground-topk"
              />
              <span className="text-body-md font-bold tabular-nums text-onBackground w-10 text-right">{topK}</span>
            </div>
          </label>
          <div className="flex items-center gap-3 flex-wrap">
            <Button type="submit" disabled={loading || !query.trim()} data-testid="playground-submit">
              {loading ? 'Searching…' : 'Run unified search'}
            </Button>
            {response && (
              <span className="text-caption text-slate" data-testid="playground-latency">
                {response.latencyMs} ms · {response.providersUsed.length} providers · {response.results.length} results
              </span>
            )}
          </div>
        </form>
      </Card>

      {error && (
        <Card variant="panel">
          <div className="text-body-md text-error font-bold" role="alert" data-testid="playground-error">
            Search failed: {error}
          </div>
        </Card>
      )}

      {response && response.providersUsed.length > 0 && (
        <Card variant="panel">
          <CardHeader title="Providers contributing" subtitle="Each provider's results are merged into the unified ranking below." />
          <div className="flex flex-wrap gap-2" data-testid="playground-providers">
            {response.providersUsed.map((p) => (
              <Badge key={p} tone="success">{p}</Badge>
            ))}
            {response.errors.map((e) => (
              <Badge key={`err-${e.provider}`} tone="error">{e.provider}: {e.message}</Badge>
            ))}
          </div>
        </Card>
      )}

      {response && (
        <Card variant="panel">
          <CardHeader
            title="Merged results"
            subtitle="Ranked by Reciprocal Rank Fusion across the providers above."
          />
          {response.results.length === 0 ? (
            <EmptyState
              title="No results"
              description="No provider returned results for this query. Try a different query or check provider health on the Dashboard."
            />
          ) : (
            <ol className="space-y-3" data-testid="playground-results">
              {response.results.map((r, i) => (
                <li key={`${r.url}-${i}`} className="rounded-2xl border border-outline bg-surface p-5 lift-on-hover hover:border-primary/40 hover:shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-label-sm uppercase text-stone tracking-wider">#{i + 1}{r.source ? ` · ${r.source}` : ''}</div>
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 block text-body-md-medium text-primary hover:underline truncate"
                      >
                        {r.title || r.url}
                      </a>
                      <div className="text-caption text-slate truncate">{r.url}</div>
                      {r.snippet && (
                        <p className="mt-2 text-body-sm text-onBackground line-clamp-3 leading-relaxed">{r.snippet}</p>
                      )}
                    </div>
                    {r.score !== undefined && (
                      <Badge tone="neutral">{r.score.toFixed(3)}</Badge>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}
    </div>
  );
}
