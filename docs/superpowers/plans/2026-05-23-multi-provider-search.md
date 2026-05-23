# multi-provider-search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 5 more MCP search tools (`search_exa`, `search_perplexity`, `search_you`, plus `search_unified`; Tavily and Brave remain Gateway built-ins) and merge their results with Reciprocal Rank Fusion.

**Architecture:** Three new Lambda adapters follow the existing `arxiv` adapter contract in `packages/adapters/src/`. `search_unified` runs a two-stage fan-out — Lambda adapters in parallel + an MCP re-invoke for the Gateway built-ins (Tavily, Brave) — and merges with RRF (k=60). Provider list, enable flags, secret ARNs, and per-provider quota live in `ConfigTable` and are loaded at cold start.

**Tech Stack:** TypeScript (Node 20 ARM64 Lambda), Zod, AWS SDK v3 (DynamoDB, Secrets Manager, AgentCore MCP client), vitest, esbuild.

**Spec reference:** `docs/superpowers/specs/2026-05-23-search-agentcore-gateway-design.md` §4.1, §4.2, §5.2, §11.2.1.

---

### Task 1: Provider config loader

**Files:**
- Create: `packages/shared/src/provider-config.ts`
- Test: `packages/shared/src/__tests__/provider-config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { parseProviderConfig } from '../provider-config.js';

describe('parseProviderConfig', () => {
  it('parses a row with required fields', () => {
    const row = {
      providerId: 'exa',
      enabled: true,
      secretArn: 'arn:aws:secretsmanager:us-east-1:111:secret:exa-Ab12',
      quota: { rpm: 60, daily: 10000 },
      timeoutMs: 8000
    };
    expect(parseProviderConfig(row)).toEqual(row);
  });

  it('rejects missing providerId', () => {
    expect(() => parseProviderConfig({ enabled: true })).toThrow();
  });

  it('rejects negative quota', () => {
    expect(() =>
      parseProviderConfig({
        providerId: 'exa',
        enabled: true,
        quota: { rpm: -1, daily: 1 },
        timeoutMs: 1000
      })
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @search-gateway/shared test -- provider-config`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
import { z } from 'zod';

export const ProviderConfigSchema = z.object({
  providerId: z.string().min(1),
  enabled: z.boolean(),
  secretArn: z.string().optional(),
  quota: z.object({ rpm: z.number().int().nonnegative(), daily: z.number().int().nonnegative() }),
  timeoutMs: z.number().int().positive()
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export function parseProviderConfig(row: unknown): ProviderConfig {
  return ProviderConfigSchema.parse(row);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @search-gateway/shared test -- provider-config`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/provider-config.ts packages/shared/src/__tests__/provider-config.test.ts
git commit -m "feat(shared): provider config schema"
```

---

### Task 2: ConfigTable reader

**Files:**
- Create: `packages/search-router/src/config-store.ts`
- Test: `packages/search-router/src/__tests__/config-store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { loadEnabledProviders } from '../config-store.js';

describe('loadEnabledProviders', () => {
  it('returns only enabled providers, validated', async () => {
    const ddb = {
      send: vi.fn().mockResolvedValue({
        Items: [
          { providerId: { S: 'exa' }, enabled: { BOOL: true }, secretArn: { S: 'arn:1' }, quota: { M: { rpm: { N: '60' }, daily: { N: '1000' } } }, timeoutMs: { N: '8000' } },
          { providerId: { S: 'you' }, enabled: { BOOL: false }, quota: { M: { rpm: { N: '60' }, daily: { N: '1000' } } }, timeoutMs: { N: '8000' } }
        ]
      })
    };
    const out = await loadEnabledProviders(ddb as any, 'ConfigTable');
    expect(out.map((p) => p.providerId)).toEqual(['exa']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter search-router test -- config-store`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
import { ScanCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { parseProviderConfig, type ProviderConfig } from '@search-gateway/shared';

export async function loadEnabledProviders(
  ddb: DynamoDBClient,
  tableName: string
): Promise<ProviderConfig[]> {
  const out = await ddb.send(new ScanCommand({ TableName: tableName }));
  return (out.Items ?? [])
    .map((i) => parseProviderConfig(unmarshall(i)))
    .filter((p) => p.enabled);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter search-router test -- config-store`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/search-router/src/config-store.ts packages/search-router/src/__tests__/config-store.test.ts
git commit -m "feat(router): load enabled providers from ConfigTable"
```

---

### Task 3: Exa adapter

**Files:**
- Create: `packages/adapters/src/exa.ts`
- Test: `packages/adapters/src/__tests__/exa.test.ts`
- Modify: `packages/adapters/src/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { exaAdapter } from '../exa.js';

const fixture = {
  results: [
    { title: 'A', url: 'https://a', text: 'snip', score: 0.9 },
    { title: 'B', url: 'https://b', text: 'snip', score: 0.8 }
  ]
};

describe('exaAdapter', () => {
  afterEach(() => vi.restoreAllMocks());

  it('maps response to SearchResult[]', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => fixture }));
    const out = await exaAdapter.search('cats', { topK: 2, apiKey: 'k' });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ title: 'A', url: 'https://a', provider: 'exa', rank: 1 });
  });

  it('throws UPSTREAM_ERROR on 5xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => 'down' }));
    await expect(exaAdapter.search('cats', { apiKey: 'k' })).rejects.toThrow(/UPSTREAM_ERROR/);
  });

  it('throws INVALID_ARGUMENT when query is empty', async () => {
    await expect(exaAdapter.search('', { apiKey: 'k' })).rejects.toThrow(/INVALID_ARGUMENT/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @search-gateway/adapters test -- exa`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
import {
  type Adapter,
  type SearchOpts,
  type SearchResult,
  ErrorCode,
  SearchError
} from '@search-gateway/shared';

const EXA_URL = 'https://api.exa.ai/search';
const TIMEOUT_MS = 8_000;

export const exaAdapter: Adapter = {
  name: 'exa',
  category: 'web',
  requiresApiKey: true,

  async search(query: string, opts?: SearchOpts): Promise<SearchResult[]> {
    if (!query.trim()) {
      throw new SearchError(ErrorCode.INVALID_ARGUMENT, 'query must be non-empty', { provider: 'exa' });
    }
    if (!opts?.apiKey) {
      throw new SearchError(ErrorCode.INTERNAL, 'missing api key', { provider: 'exa' });
    }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(EXA_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': opts.apiKey },
        body: JSON.stringify({ query, numResults: opts?.topK ?? 10 }),
        signal: ac.signal
      });
      if (!res.ok) {
        throw new SearchError(ErrorCode.UPSTREAM_ERROR, `exa ${res.status}`, { provider: 'exa' });
      }
      const data = (await res.json()) as { results: Array<{ title: string; url: string; text?: string; score?: number }> };
      return data.results.map((r, i) => ({
        title: r.title,
        url: r.url,
        snippet: r.text ?? '',
        score: r.score,
        provider: 'exa',
        rank: i + 1
      }));
    } finally {
      clearTimeout(timer);
    }
  }
};
```

Update `packages/adapters/src/index.ts` to add:

```ts
import { exaAdapter } from './exa.js';
registerAdapter(exaAdapter);
export { exaAdapter };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @search-gateway/adapters test -- exa`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/exa.ts packages/adapters/src/__tests__/exa.test.ts packages/adapters/src/index.ts
git commit -m "feat(adapters): exa search adapter"
```

---

### Task 4: Perplexity adapter

**Files:**
- Create: `packages/adapters/src/perplexity.ts`
- Test: `packages/adapters/src/__tests__/perplexity.test.ts`
- Modify: `packages/adapters/src/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { perplexityAdapter } from '../perplexity.js';

const fixture = {
  choices: [
    {
      message: {
        citations: [
          { title: 'A', url: 'https://a', snippet: 's1' },
          { title: 'B', url: 'https://b', snippet: 's2' }
        ]
      }
    }
  ]
};

describe('perplexityAdapter', () => {
  afterEach(() => vi.restoreAllMocks());

  it('maps citations to SearchResult[]', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => fixture }));
    const out = await perplexityAdapter.search('cats', { apiKey: 'k', topK: 2 });
    expect(out).toHaveLength(2);
    expect(out[0].provider).toBe('perplexity');
  });

  it('throws on missing api key', async () => {
    await expect(perplexityAdapter.search('cats', {})).rejects.toThrow(/INTERNAL/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @search-gateway/adapters test -- perplexity`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
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
      throw new SearchError(ErrorCode.INVALID_ARGUMENT, 'query must be non-empty', { provider: 'perplexity' });
    }
    if (!opts?.apiKey) {
      throw new SearchError(ErrorCode.INTERNAL, 'missing api key', { provider: 'perplexity' });
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
        throw new SearchError(ErrorCode.UPSTREAM_ERROR, `perplexity ${res.status}`, { provider: 'perplexity' });
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
```

Register in `packages/adapters/src/index.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @search-gateway/adapters test -- perplexity`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/perplexity.ts packages/adapters/src/__tests__/perplexity.test.ts packages/adapters/src/index.ts
git commit -m "feat(adapters): perplexity search adapter"
```

---

### Task 5: You.com adapter

**Files:**
- Create: `packages/adapters/src/you.ts`
- Test: `packages/adapters/src/__tests__/you.test.ts`
- Modify: `packages/adapters/src/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { youAdapter } from '../you.js';

const fixture = {
  hits: [
    { title: 'A', url: 'https://a', description: 'd1' },
    { title: 'B', url: 'https://b', description: 'd2' }
  ]
};

describe('youAdapter', () => {
  afterEach(() => vi.restoreAllMocks());

  it('maps hits to SearchResult[]', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => fixture }));
    const out = await youAdapter.search('cats', { apiKey: 'k', topK: 2 });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ provider: 'you', rank: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @search-gateway/adapters test -- you`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
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
      throw new SearchError(ErrorCode.INVALID_ARGUMENT, 'query must be non-empty', { provider: 'you' });
    }
    if (!opts?.apiKey) {
      throw new SearchError(ErrorCode.INTERNAL, 'missing api key', { provider: 'you' });
    }
    const url = new URL(BASE);
    url.searchParams.set('query', query);
    url.searchParams.set('num_web_results', String(opts?.topK ?? 10));
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { headers: { 'X-API-Key': opts.apiKey }, signal: ac.signal });
      if (!res.ok) {
        throw new SearchError(ErrorCode.UPSTREAM_ERROR, `you ${res.status}`, { provider: 'you' });
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
```

Register in `packages/adapters/src/index.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @search-gateway/adapters test -- you`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/you.ts packages/adapters/src/__tests__/you.test.ts packages/adapters/src/index.ts
git commit -m "feat(adapters): you.com search adapter"
```

---

### Task 6: Reciprocal Rank Fusion merger

**Files:**
- Create: `packages/shared/src/rrf.ts`
- Test: `packages/shared/src/__tests__/rrf.test.ts`
- Modify: `packages/shared/src/index.ts` (re-export)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { mergeRRF } from '../rrf.js';

describe('mergeRRF', () => {
  it('merges by URL with k=60', () => {
    const a = [{ title: 'A', url: 'u1', snippet: '', provider: 'exa', rank: 1 }];
    const b = [{ title: 'A', url: 'u1', snippet: '', provider: 'tavily', rank: 1 }];
    const out = mergeRRF([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe('u1');
    // 1/(60+1) + 1/(60+1) ≈ 0.0328
    expect(out[0].score).toBeCloseTo(2 / 61, 5);
  });

  it('preserves unique URLs', () => {
    const a = [{ title: 'A', url: 'u1', snippet: '', provider: 'exa', rank: 1 }];
    const b = [{ title: 'B', url: 'u2', snippet: '', provider: 'tavily', rank: 1 }];
    expect(mergeRRF([a, b])).toHaveLength(2);
  });

  it('respects topK', () => {
    const a = Array.from({ length: 5 }, (_, i) => ({
      title: `t${i}`,
      url: `u${i}`,
      snippet: '',
      provider: 'exa',
      rank: i + 1
    }));
    expect(mergeRRF([a], { topK: 3 })).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @search-gateway/shared test -- rrf`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { SearchResult } from './types.js';

export interface MergeOpts {
  k?: number;
  topK?: number;
}

export function mergeRRF(lists: SearchResult[][], opts: MergeOpts = {}): SearchResult[] {
  const k = opts.k ?? 60;
  const byUrl = new Map<string, { result: SearchResult; score: number; providers: string[] }>();
  for (const list of lists) {
    list.forEach((r, i) => {
      const rank = r.rank ?? i + 1;
      const score = 1 / (k + rank);
      const cur = byUrl.get(r.url);
      if (cur) {
        cur.score += score;
        if (!cur.providers.includes(r.provider)) cur.providers.push(r.provider);
      } else {
        byUrl.set(r.url, { result: { ...r }, score, providers: [r.provider] });
      }
    });
  }
  const merged = Array.from(byUrl.values())
    .sort((a, b) => b.score - a.score)
    .map((e) => ({ ...e.result, score: e.score, provider: e.providers.join(',') }));
  return opts.topK ? merged.slice(0, opts.topK) : merged;
}
```

Re-export from `packages/shared/src/index.ts`: `export { mergeRRF, type MergeOpts } from './rrf.js';`

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @search-gateway/shared test -- rrf`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/rrf.ts packages/shared/src/__tests__/rrf.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): RRF merge with k=60"
```

---

### Task 7: MCP re-invoke client (Tavily/Brave)

**Files:**
- Create: `packages/search-router/src/gateway-client.ts`
- Test: `packages/search-router/src/__tests__/gateway-client.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { callGatewayBuiltin } from '../gateway-client.js';

describe('callGatewayBuiltin', () => {
  it('calls Gateway tools/call and maps results', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: {
          content: [{ type: 'json', json: { results: [{ title: 'T', url: 'u', snippet: 's' }] } }]
        }
      })
    });
    const out = await callGatewayBuiltin(
      { gatewayUrl: 'https://gw', token: 'jwt', tool: 'search_tavily', query: 'cats', topK: 3 },
      fetcher as any
    );
    expect(out).toEqual([{ title: 'T', url: 'u', snippet: 's', provider: 'tavily', rank: 1 }]);
  });

  it('throws UPSTREAM_ERROR on 5xx', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 502, text: async () => '' });
    await expect(
      callGatewayBuiltin({ gatewayUrl: 'https://gw', token: 'jwt', tool: 'search_brave', query: 'q' }, fetcher as any)
    ).rejects.toThrow(/UPSTREAM_ERROR/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter search-router test -- gateway-client`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
import { ErrorCode, SearchError, type SearchResult } from '@search-gateway/shared';

export interface GatewayCall {
  gatewayUrl: string;
  token: string;
  tool: string; // e.g., 'search_tavily'
  query: string;
  topK?: number;
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
    throw new SearchError(ErrorCode.UPSTREAM_ERROR, `gateway ${res.status}`, { provider });
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter search-router test -- gateway-client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/search-router/src/gateway-client.ts packages/search-router/src/__tests__/gateway-client.test.ts
git commit -m "feat(router): MCP re-invoke client for Gateway built-ins"
```

---

### Task 8: search_unified two-stage fan-out

**Files:**
- Create: `packages/search-router/src/unified.ts`
- Test: `packages/search-router/src/__tests__/unified.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { runUnified } from '../unified.js';

describe('runUnified', () => {
  it('fans out to Lambda adapters and Gateway built-ins, merges with RRF', async () => {
    const exa = { search: vi.fn().mockResolvedValue([{ title: 'X', url: 'u1', snippet: '', provider: 'exa', rank: 1 }]) };
    const builtin = vi.fn().mockResolvedValue([{ title: 'X', url: 'u1', snippet: '', provider: 'tavily', rank: 1 }]);
    const out = await runUnified({
      query: 'cats',
      topK: 5,
      lambdaAdapters: { exa: exa as any },
      builtinTools: ['search_tavily'],
      callBuiltin: builtin
    });
    expect(out.results).toHaveLength(1);
    expect(out.results[0].provider).toContain('exa');
    expect(out.results[0].provider).toContain('tavily');
    expect(out.providersUsed.sort()).toEqual(['exa', 'tavily']);
  });

  it('continues when one provider errors', async () => {
    const exa = { search: vi.fn().mockRejectedValue(new Error('boom')) };
    const builtin = vi.fn().mockResolvedValue([{ title: 'B', url: 'u2', snippet: '', provider: 'brave', rank: 1 }]);
    const out = await runUnified({
      query: 'q',
      lambdaAdapters: { exa: exa as any },
      builtinTools: ['search_brave'],
      callBuiltin: builtin
    });
    expect(out.results).toHaveLength(1);
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0].provider).toBe('exa');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter search-router test -- unified`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter search-router test -- unified`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/search-router/src/unified.ts packages/search-router/src/__tests__/unified.test.ts
git commit -m "feat(router): search_unified two-stage fan-out"
```

---

### Task 9: Wire unified into the handler

**Files:**
- Modify: `packages/search-router/src/handler.ts`
- Test: `packages/search-router/src/__tests__/handler.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Add to `handler.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createHandler } from '../handler.js';

describe('handler search_unified', () => {
  it('routes to runUnified and returns merged results', async () => {
    const exa = { name: 'exa', search: vi.fn().mockResolvedValue([{ title: 'A', url: 'u', snippet: '', provider: 'exa', rank: 1 }]) };
    const handler = createHandler({
      adapters: { exa: exa as any },
      quota: { consume: vi.fn().mockResolvedValue(undefined) } as any,
      limits: { exa: { rpm: 60, daily: 1000 } },
      unified: {
        builtinTools: [],
        callBuiltin: vi.fn()
      }
    });
    const res = await handler({ toolName: 'search_unified', arguments: { query: 'cats', topK: 5 } });
    expect('results' in res).toBe(true);
    if ('results' in res) {
      expect(res.providersUsed).toContain('exa');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter search-router test -- handler`
Expected: FAIL — handler does not understand `search_unified`.

- [ ] **Step 3: Write minimal implementation**

In `handler.ts`, before the `search_<provider>` dispatch add:

```ts
if (tool === 'search_unified') {
  if (!deps.unified) {
    const err = new SearchError(ErrorCode.INTERNAL, 'unified not configured');
    return { error: err.toJSON() as { code: string; message: string; provider?: string; retryAfterSec?: number } };
  }
  const args = z.object({ query: z.string().min(1).max(2048), topK: z.number().int().positive().max(50).optional() }).parse(event.arguments);
  const out = await runUnified({
    query: args.query,
    topK: args.topK,
    lambdaAdapters: deps.adapters,
    builtinTools: deps.unified.builtinTools,
    callBuiltin: deps.unified.callBuiltin,
    apiKeys: deps.unified.apiKeys
  });
  return { results: out.results, providersUsed: out.providersUsed };
}
```

Extend `HandlerDeps`:

```ts
unified?: {
  builtinTools: string[];
  callBuiltin: (tool: string, query: string, topK?: number) => Promise<SearchResult[]>;
  apiKeys?: Record<string, string>;
};
```

Import `runUnified` from `./unified.js`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter search-router test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/search-router/src/handler.ts packages/search-router/src/__tests__/handler.test.ts
git commit -m "feat(router): dispatch search_unified through fan-out"
```

---

### Task 10: Cold-start wiring in entry.ts

**Files:**
- Modify: `packages/search-router/src/entry.ts`

- [ ] **Step 1: Write the failing integration check**

There is no unit test for `entry.ts` (it is wiring). Verify by `pnpm typecheck` after Step 3. Skip Step 1/2 here.

- [ ] **Step 2: (skipped — wiring file)**

- [ ] **Step 3: Write minimal implementation**

Update `entry.ts` to:
1. Read `CONFIG_TABLE`, `GATEWAY_URL`, `GATEWAY_TOKEN_SSM_PARAM` env vars.
2. On cold start, call `loadEnabledProviders` and pass into the handler.
3. Build a `callBuiltin` closure that calls `callGatewayBuiltin` with a token resolved at call time.
4. Pass `unified.builtinTools` from a stack-prop env var (`UNIFIED_BUILTINS=search_tavily,search_brave`).
5. Resolve API keys from Secrets Manager (existing cache module) only for adapters whose `requiresApiKey` is true.

- [ ] **Step 4: Verify**

Run: `pnpm --filter search-router build && pnpm --filter search-router test`
Expected: build clean, all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/search-router/src/entry.ts
git commit -m "feat(router): wire ConfigTable + Gateway client into cold start"
```

---

### Task 11: CDK — register new tools as Gateway targets

**Files:**
- Modify: `infra/lib/gateway/targets.ts` (or equivalent — if absent, create)
- Modify: `infra/lib/stacks/search-stack.ts`
- Test: `infra/test/gateway-targets.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { Template } from 'aws-cdk-lib/assertions';
import { App } from 'aws-cdk-lib';
import { SearchStack } from '../lib/stacks/search-stack.js';

it('registers search_unified, search_exa, search_perplexity, search_you as targets', () => {
  const app = new App();
  const stack = new SearchStack(app, 'T', { env: { account: '111', region: 'us-east-1' } });
  const t = Template.fromStack(stack);
  // Custom resource per target — expectation depends on construct
  const resources = t.findResources('AWS::CloudFormation::CustomResource');
  const names = Object.values(resources)
    .map((r) => (r as any).Properties?.toolName)
    .filter(Boolean);
  expect(names).toEqual(expect.arrayContaining(['search_unified', 'search_exa', 'search_perplexity', 'search_you']));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter infra test -- gateway-targets`
Expected: FAIL — only `search_arxiv` registered.

- [ ] **Step 3: Write minimal implementation**

Extend the existing target-registration construct to iterate over a stack-prop list `tools: ['search_arxiv', 'search_exa', ...]` and register each. Do NOT register Tavily/Brave from CDK — they are Gateway built-ins added via the AgentCore console / SDK pre-step.

- [ ] **Step 4: Verify**

Run: `pnpm --filter infra test && pnpm cdk synth`
Expected: PASS, synth clean.

- [ ] **Step 5: Commit**

```bash
git add infra/lib/gateway/targets.ts infra/lib/stacks/search-stack.ts infra/test/gateway-targets.test.ts
git commit -m "feat(infra): register multi-provider targets in Gateway"
```

---

### Task 12: ConfigTable seed for new providers

**Files:**
- Modify: `infra/lib/data/config-seed.ts` (or equivalent seed construct)

- [ ] **Step 1: Add seeded rows**

Add a `BatchWrite` custom resource that seeds rows for `exa`, `perplexity`, `you` with `enabled: false` and an empty `secretArn`. Tavily / Brave are also seeded as `builtin: true` (no `secretArn` — Gateway holds the credential).

- [ ] **Step 2: Verify**

Run: `pnpm --filter infra test && pnpm cdk synth`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add infra/lib/data/config-seed.ts
git commit -m "chore(infra): seed ConfigTable with new providers (default disabled)"
```

---

### Task 13: Per-provider EMF metric dimension

**Files:**
- Modify: `packages/search-router/src/handler.ts` (existing emit calls)

- [ ] **Step 1: Add provider dimension to existing metrics**

Where the handler emits `Latency`, `Errors`, etc., add a `provider` dimension. For `search_unified`, emit one summary metric per request and one per fan-out leg.

- [ ] **Step 2: Verify**

Run: `pnpm --filter search-router test`
Expected: PASS (existing tests asserting EMF should be updated to expect the new dimension).

- [ ] **Step 3: Commit**

```bash
git add packages/search-router/src/handler.ts packages/search-router/src/__tests__/handler.test.ts
git commit -m "feat(router): per-provider EMF dimension"
```

---

### Task 14: Deploy + smoke-test in dev account

**Files:** none

- [ ] **Step 1: Deploy**

Run: `pnpm cdk deploy --all --context env=dev`
Expected: deploys cleanly.

- [ ] **Step 2: Seed dev Secrets Manager**

Manually store dev API keys in the secrets created by Task 12, then `PUT /api/providers/<id>` to flip `enabled: true` once `admin-bff` exists. Until then, flip directly in DDB.

- [ ] **Step 3: Smoke-test each new tool**

Use the MCP test client (`scripts/mcp-call.sh`) to call:
- `search_exa`, `search_perplexity`, `search_you` — expect non-empty results.
- `search_unified` — expect results from at least one Lambda adapter and one built-in (Tavily or Brave).

- [ ] **Step 4: Commit smoke-test script if updated**

```bash
git add scripts/mcp-call.sh
git commit -m "chore(scripts): smoke-test multi-provider tools"
```

---

## Acceptance (mirrors spec §11.2.1)

1. All five additional MCP tools list and call successfully against a deployed dev stack.
2. `search_unified` returns merged results from at least one Lambda adapter and one Gateway built-in in a single call.
3. Per-adapter contract tests pass with recorded fixtures (Tasks 3–5).
4. RRF merge test covers tie-breaks and missing rankings (Task 6).
5. EMF metrics emit a `provider` dimension for every call (Task 13).
