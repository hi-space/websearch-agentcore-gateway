# Provider Verified-Enable Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `ConfigTable.enabled = true` mean "verified to work recently" by gating OFF→ON transitions in `update-provider` behind a live search-router probe, recording the result in a new `lastVerify` map, clamping `enabled` to `false` whenever a secret is rotated, and exposing the freshness state in the admin UI.

**Architecture:** All verification logic lives in the admin-console BFF. `update-provider` invokes the existing search-router Lambda for the provider being enabled and writes `lastVerify` alongside `enabled`. `put-secret` and `test-provider` also touch `lastVerify`. The UI gets a fourth provider badge driven by a single `getVerifyStatus` helper. A one-shot migration script disables all currently-oily provider rows so operators re-enable them through the new gate. No infra changes; admin-console Lambda already holds `lambda:InvokeFunction` against the router ARN.

**Tech Stack:** TypeScript / Next.js 14 App Router (admin-console), AWS SDK v3 (DynamoDB, Lambda, Secrets Manager), Zod, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-05-28-provider-verified-enable-design.md`

---

## File Structure

**Create:**
- `packages/admin-console/src/lib/verify-status.ts` — pure helper, exports `VERIFY_FRESH_MS`, `LastVerify` type, `getVerifyStatus(lv, now?)`.
- `packages/admin-console/src/lib/__tests__/verify-status.test.ts` — boundary tests for the helper.
- `packages/admin-console/src/handlers/probe-provider.ts` — shared "invoke search-router and parse result" function reused by `update-provider` and `test-provider`. Returns `LastVerify`.
- `packages/admin-console/src/handlers/__tests__/probe-provider.test.ts` — unit tests for the shared probe.
- `infra/scripts/migrate-config-disable-unverified.ts` — one-shot CLI script.

**Modify:**
- `packages/admin-console/src/handlers/update-provider.ts` — add probe gate on OFF→ON; persist `lastVerify`; clamp `enabled=false` on failure.
- `packages/admin-console/src/handlers/__tests__/update-provider.test.ts` — extend with probe-gate cases; keep existing Key/reserved-word checks.
- `packages/admin-console/src/handlers/test-provider.ts` — write `lastVerify` to ConfigTable, return it in the response.
- `packages/admin-console/src/handlers/__tests__/test-provider.test.ts` — assert UpdateItem and response shape.
- `packages/admin-console/src/handlers/put-secret.ts` — single UpdateItem that REMOVEs `lastVerify` and SETs `enabled=false`.
- `packages/admin-console/src/handlers/__tests__/put-secret.test.ts` — assert the new UpdateItem.
- `packages/admin-console/src/handlers/list-providers.ts` — pass `lastVerify` through.
- `packages/admin-console/src/handlers/__tests__/list-providers.test.ts` — assert `lastVerify` in the row.
- `packages/admin-console/app/api/providers/[id]/route.ts` — return JSON status 400 with `{ error: 'VERIFICATION_FAILED', lastVerify }` when handler throws that error.
- `packages/admin-console/app/api/providers/[id]/test/route.ts` — pass `ddb` + `CONFIG_TABLE` so the probe can persist `lastVerify`.
- `packages/admin-console/app/api/providers/[id]/secret/route.ts` — pass through (no signature changes; handler now updates ConfigTable).
- `packages/admin-console/src/lib/api.ts` — extend `ProviderRow`, `updateProvider` and `testProvider` types.
- `packages/admin-console/src/views/ProviderList.tsx` — Verification column + badge.
- `packages/admin-console/src/views/__tests__/ProviderList.test.tsx` — four-state badge rendering.
- `packages/admin-console/src/views/ProviderDetail.tsx` — header badge, Save flow toggle revert, Secret-tab helper text.
- `packages/admin-console/src/views/__tests__/ProviderDetail.test.tsx` — VERIFICATION_FAILED revert, secret-rotated helper.

---

### Task 1: `verify-status` helper

**Files:**
- Create: `packages/admin-console/src/lib/verify-status.ts`
- Test: `packages/admin-console/src/lib/__tests__/verify-status.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/admin-console/src/lib/__tests__/verify-status.test.ts
import { describe, it, expect } from 'vitest';
import { getVerifyStatus, VERIFY_FRESH_MS, type LastVerify } from '../verify-status';

const NOW = Date.parse('2026-05-28T12:00:00.000Z');
const isoMinusMin = (m: number) => new Date(NOW - m * 60_000).toISOString();

describe('getVerifyStatus', () => {
  it('returns "unverified" when lastVerify is undefined', () => {
    expect(getVerifyStatus(undefined, NOW)).toBe('unverified');
  });

  it('returns "failed" when lastVerify.ok is false', () => {
    const lv: LastVerify = { at: isoMinusMin(1), ok: false, code: 'UPSTREAM_ERROR' };
    expect(getVerifyStatus(lv, NOW)).toBe('failed');
  });

  it('returns "verified" inside the fresh window', () => {
    const lv: LastVerify = { at: isoMinusMin(59), ok: true };
    expect(getVerifyStatus(lv, NOW)).toBe('verified');
  });

  it('returns "verified" exactly at the fresh boundary', () => {
    const lv: LastVerify = { at: isoMinusMin(60), ok: true };
    expect(getVerifyStatus(lv, NOW)).toBe('verified');
  });

  it('returns "stale" past the fresh window', () => {
    const lv: LastVerify = { at: isoMinusMin(61), ok: true };
    expect(getVerifyStatus(lv, NOW)).toBe('stale');
  });

  it('exports VERIFY_FRESH_MS as 1 hour', () => {
    expect(VERIFY_FRESH_MS).toBe(60 * 60 * 1000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/admin-console && pnpm vitest run src/lib/__tests__/verify-status.test.ts`
Expected: FAIL with `Cannot find module '../verify-status'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/admin-console/src/lib/verify-status.ts
export const VERIFY_FRESH_MS = 60 * 60 * 1000;

export interface LastVerify {
  at: string;
  ok: boolean;
  error?: string;
  code?: string;
}

export type VerifyStatus = 'verified' | 'stale' | 'failed' | 'unverified';

export function getVerifyStatus(lv: LastVerify | undefined, now: number = Date.now()): VerifyStatus {
  if (!lv) return 'unverified';
  if (!lv.ok) return 'failed';
  const at = Date.parse(lv.at);
  if (Number.isNaN(at)) return 'unverified';
  return now - at <= VERIFY_FRESH_MS ? 'verified' : 'stale';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/__tests__/verify-status.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/admin-console/src/lib/verify-status.ts \
        packages/admin-console/src/lib/__tests__/verify-status.test.ts
git commit -m "feat(admin-console): add verify-status helper for provider freshness"
```

---

### Task 2: Shared `probeProvider` handler

**Files:**
- Create: `packages/admin-console/src/handlers/probe-provider.ts`
- Test: `packages/admin-console/src/handlers/__tests__/probe-provider.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/admin-console/src/handlers/__tests__/probe-provider.test.ts
import { describe, it, expect, vi } from 'vitest';
import { probeProvider } from '../probe-provider';

const enc = (obj: unknown) => Buffer.from(JSON.stringify(obj));

describe('probeProvider', () => {
  it('returns ok=true when router responds with results', async () => {
    const lambda = {
      send: vi.fn().mockResolvedValue({ Payload: enc({ results: [{ url: 'u', title: 't', snippet: 's', provider: 'exa' }], providersUsed: ['exa'] }) })
    };
    const out = await probeProvider(lambda as any, 'router-arn', 'exa', () => Date.parse('2026-05-28T12:00:00.000Z'));
    expect(out.ok).toBe(true);
    expect(out.at).toBe('2026-05-28T12:00:00.000Z');
    expect(out.error).toBeUndefined();
  });

  it('returns ok=false with code/error when router responds with an error envelope', async () => {
    const lambda = {
      send: vi.fn().mockResolvedValue({ Payload: enc({ error: { code: 'UPSTREAM_ERROR', message: 'UPSTREAM_ERROR: exa 401' } }) })
    };
    const out = await probeProvider(lambda as any, 'router-arn', 'exa', () => Date.parse('2026-05-28T12:00:00.000Z'));
    expect(out).toEqual({
      at: '2026-05-28T12:00:00.000Z',
      ok: false,
      code: 'UPSTREAM_ERROR',
      error: 'UPSTREAM_ERROR: exa 401'
    });
  });

  it('returns ok=false with code=INVOKE_FAILED when invoke throws', async () => {
    const lambda = { send: vi.fn().mockRejectedValue(new Error('throttled')) };
    const out = await probeProvider(lambda as any, 'router-arn', 'exa', () => Date.parse('2026-05-28T12:00:00.000Z'));
    expect(out).toEqual({
      at: '2026-05-28T12:00:00.000Z',
      ok: false,
      code: 'INVOKE_FAILED',
      error: 'throttled'
    });
  });

  it('sends an InvokeCommand with toolName=search_<id> and a probe query', async () => {
    const send = vi.fn().mockResolvedValue({ Payload: enc({ results: [], providersUsed: ['exa'] }) });
    await probeProvider({ send } as any, 'router-arn', 'exa', () => Date.now());
    const cmd = send.mock.calls[0][0];
    expect(cmd.input.FunctionName).toBe('router-arn');
    const payload = JSON.parse(Buffer.from(cmd.input.Payload).toString());
    expect(payload).toEqual({ toolName: 'search_exa', arguments: { query: 'connectivity probe' } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/handlers/__tests__/probe-provider.test.ts`
Expected: FAIL with `Cannot find module '../probe-provider'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/admin-console/src/handlers/probe-provider.ts
import { InvokeCommand, type LambdaClient } from '@aws-sdk/client-lambda';
import type { LastVerify } from '../lib/verify-status';

export type Clock = () => number;

export async function probeProvider(
  lambda: LambdaClient,
  routerArn: string,
  providerId: string,
  clock: Clock = Date.now
): Promise<LastVerify> {
  const at = new Date(clock()).toISOString();
  try {
    const out = await lambda.send(
      new InvokeCommand({
        FunctionName: routerArn,
        Payload: Buffer.from(
          JSON.stringify({ toolName: `search_${providerId}`, arguments: { query: 'connectivity probe' } })
        )
      })
    );
    const body = JSON.parse(new TextDecoder().decode(out.Payload)) as
      | { results: unknown[] }
      | { error: { code: string; message: string } };
    if ('error' in body) {
      return { at, ok: false, code: body.error.code, error: body.error.message };
    }
    return { at, ok: true };
  } catch (e) {
    return { at, ok: false, code: 'INVOKE_FAILED', error: (e as Error).message };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/handlers/__tests__/probe-provider.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/admin-console/src/handlers/probe-provider.ts \
        packages/admin-console/src/handlers/__tests__/probe-provider.test.ts
git commit -m "feat(admin-console): add shared probeProvider for connectivity checks"
```

---

### Task 3: `list-providers` exposes `lastVerify`

**Files:**
- Modify: `packages/admin-console/src/handlers/list-providers.ts`
- Modify: `packages/admin-console/src/handlers/__tests__/list-providers.test.ts`

- [ ] **Step 1: Update the failing test**

Edit `src/handlers/__tests__/list-providers.test.ts` so it covers both the row that has `lastVerify` and one that doesn't. Replace the file body with:

```ts
import { describe, it, expect, vi } from 'vitest';
import { listProviders } from '../list-providers';

describe('listProviders', () => {
  it('returns rows with lastVerify when present, omits it otherwise', async () => {
    const ddb = {
      send: vi.fn().mockResolvedValue({
        Items: [
          {
            providerId: { S: 'exa' },
            enabled: { BOOL: true },
            secretArn: { S: 'arn:x' },
            quota: { M: { rpm: { N: '60' }, daily: { N: '1000' } } },
            timeoutMs: { N: '8000' },
            lastVerify: {
              M: {
                at: { S: '2026-05-28T12:00:00.000Z' },
                ok: { BOOL: true }
              }
            }
          },
          {
            providerId: { S: 'arxiv' },
            enabled: { BOOL: false },
            quota: { M: { rpm: { N: '60' }, daily: { N: '1000' } } },
            timeoutMs: { N: '8000' }
          }
        ]
      })
    };
    const out = await listProviders(ddb as any, 'ConfigTable');
    expect(out[0]).toEqual({
      providerId: 'exa',
      enabled: true,
      hasSecret: true,
      quota: { rpm: 60, daily: 1000 },
      timeoutMs: 8000,
      lastVerify: { at: '2026-05-28T12:00:00.000Z', ok: true }
    });
    expect(out[1]).toEqual({
      providerId: 'arxiv',
      enabled: false,
      hasSecret: false,
      quota: { rpm: 60, daily: 1000 },
      timeoutMs: 8000
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/handlers/__tests__/list-providers.test.ts`
Expected: FAIL — output rows do not include `lastVerify`.

- [ ] **Step 3: Implement**

Replace the body of `packages/admin-console/src/handlers/list-providers.ts` with:

```ts
import { ScanCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { LastVerify } from '../lib/verify-status';

export interface ProviderRow {
  providerId: string;
  enabled: boolean;
  hasSecret: boolean;
  quota: { rpm: number; daily: number };
  timeoutMs: number;
  lastVerify?: LastVerify;
}

export async function listProviders(ddb: DynamoDBClient, tableName: string): Promise<ProviderRow[]> {
  const out = await ddb.send(new ScanCommand({ TableName: tableName }));
  return (out.Items ?? []).map((i) => {
    const r = unmarshall(i) as {
      providerId: string;
      enabled: boolean;
      secretArn?: string;
      quota: { rpm: number; daily: number };
      timeoutMs: number;
      lastVerify?: LastVerify;
    };
    const row: ProviderRow = {
      providerId: r.providerId,
      enabled: r.enabled,
      hasSecret: !!r.secretArn,
      quota: r.quota,
      timeoutMs: r.timeoutMs
    };
    if (r.lastVerify) row.lastVerify = r.lastVerify;
    return row;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/handlers/__tests__/list-providers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/admin-console/src/handlers/list-providers.ts \
        packages/admin-console/src/handlers/__tests__/list-providers.test.ts
git commit -m "feat(admin-console): surface lastVerify on listProviders rows"
```

---

### Task 4: Wire `lastVerify` into the front-end API types

**Files:**
- Modify: `packages/admin-console/src/lib/api.ts`

- [ ] **Step 1: Implement (no behavior change to verify with a test)**

Replace the relevant sections of `packages/admin-console/src/lib/api.ts` so the types match the new contract. Apply these edits exactly:

1. Replace the `ProviderRow` interface block with:

```ts
import type { LastVerify } from './verify-status';

export interface ProviderRow {
  providerId: string;
  enabled: boolean;
  hasSecret: boolean;
  quota: { rpm: number; daily: number };
  timeoutMs: number;
  lastVerify?: LastVerify;
}
```

2. Replace the `testProvider` entry in the `adminApi` object with:

```ts
  testProvider: (id: string) =>
    call<{ ok: boolean; results?: number; error?: string; lastVerify?: LastVerify }>(
      `/api/providers/${id}/test`,
      { method: 'POST' }
    ),
```

3. Add an export for the type so views can `import { LastVerify } from '../lib/api'` if they prefer:

```ts
export type { LastVerify } from './verify-status';
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no new errors versus the pre-existing baseline failure in `playground-search.test.ts:31` (unrelated).

- [ ] **Step 3: Commit**

```bash
git add packages/admin-console/src/lib/api.ts
git commit -m "feat(admin-console): widen ProviderRow / testProvider with lastVerify"
```

---

### Task 5: `update-provider` probe gate

**Files:**
- Modify: `packages/admin-console/src/handlers/update-provider.ts`
- Modify: `packages/admin-console/src/handlers/__tests__/update-provider.test.ts`
- Modify: `packages/admin-console/app/api/providers/[id]/route.ts`

- [ ] **Step 1: Write the failing tests**

Append the following cases to `src/handlers/__tests__/update-provider.test.ts`. Keep all existing tests intact.

```ts
import { LambdaClient } from '@aws-sdk/client-lambda';

const enc = (obj: unknown) => Buffer.from(JSON.stringify(obj));

describe('updateProvider verified-enable gate', () => {
  function makeDeps(routerPayload: unknown, beforeEnabled = false) {
    const ddb = {
      send: vi
        .fn()
        // GET (before)
        .mockResolvedValueOnce({
          Item: {
            providerId: { S: 'exa' },
            enabled: { BOOL: beforeEnabled },
            quota: { M: { rpm: { N: '60' }, daily: { N: '1000' } } },
            timeoutMs: { N: '8000' }
          }
        })
        // UPDATE
        .mockResolvedValueOnce({})
        // AUDIT
        .mockResolvedValueOnce({})
    };
    const lambda = { send: vi.fn().mockResolvedValue({ Payload: enc(routerPayload) }) };
    return { ddb, lambda };
  }

  it('OFF→ON: probe success persists enabled=true and lastVerify.ok=true', async () => {
    const { ddb, lambda } = makeDeps({ results: [], providersUsed: ['exa'] }, false);
    const out = await updateProvider(
      ddb as any,
      lambda as unknown as LambdaClient,
      'router-arn',
      'ConfigTable',
      'AuditLogTable',
      'user-1',
      'exa',
      { enabled: true, quota: { rpm: 120, daily: 2000 }, timeoutMs: 8000 }
    );
    expect(out.enabled).toBe(true);
    expect(out.lastVerify?.ok).toBe(true);
    const updateInput = ddb.send.mock.calls[1][0].input;
    expect(updateInput.UpdateExpression).toMatch(/SET #enabled = :e, quota = :q, timeoutMs = :t, lastVerify = :lv/);
    const values = updateInput.ExpressionAttributeValues;
    expect(values[':e']).toEqual({ BOOL: true });
    expect(values[':lv'].M.ok).toEqual({ BOOL: true });
    expect(lambda.send).toHaveBeenCalledTimes(1);
  });

  it('OFF→ON: probe error envelope clamps enabled=false and surfaces VERIFICATION_FAILED', async () => {
    const { ddb, lambda } = makeDeps({ error: { code: 'UPSTREAM_ERROR', message: 'UPSTREAM_ERROR: exa 401' } }, false);
    await expect(
      updateProvider(
        ddb as any,
        lambda as unknown as LambdaClient,
        'router-arn',
        'ConfigTable',
        'AuditLogTable',
        'user-1',
        'exa',
        { enabled: true, quota: { rpm: 60, daily: 1000 }, timeoutMs: 8000 }
      )
    ).rejects.toMatchObject({
      message: 'VERIFICATION_FAILED',
      lastVerify: { ok: false, code: 'UPSTREAM_ERROR' }
    });
    const updateInput = ddb.send.mock.calls[1][0].input;
    expect(updateInput.ExpressionAttributeValues[':e']).toEqual({ BOOL: false });
    expect(updateInput.ExpressionAttributeValues[':lv'].M.ok).toEqual({ BOOL: false });
  });

  it('OFF→ON: lambda invoke throws → INVOKE_FAILED, enabled clamped', async () => {
    const ddb = {
      send: vi
        .fn()
        .mockResolvedValueOnce({
          Item: {
            providerId: { S: 'exa' },
            enabled: { BOOL: false },
            quota: { M: { rpm: { N: '60' }, daily: { N: '1000' } } },
            timeoutMs: { N: '8000' }
          }
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
    };
    const lambda = { send: vi.fn().mockRejectedValue(new Error('throttled')) };
    await expect(
      updateProvider(
        ddb as any,
        lambda as unknown as LambdaClient,
        'router-arn',
        'ConfigTable',
        'AuditLogTable',
        'user-1',
        'exa',
        { enabled: true, quota: { rpm: 60, daily: 1000 }, timeoutMs: 8000 }
      )
    ).rejects.toMatchObject({
      message: 'VERIFICATION_FAILED',
      lastVerify: { ok: false, code: 'INVOKE_FAILED', error: 'throttled' }
    });
  });

  it('ON→ON / ON→OFF / quota-only: probe is not invoked', async () => {
    for (const next of [
      { enabled: true, quota: { rpm: 10, daily: 100 }, timeoutMs: 8000 },
      { enabled: false, quota: { rpm: 60, daily: 1000 }, timeoutMs: 8000 }
    ]) {
      const { ddb, lambda } = makeDeps({ results: [] }, true);
      await updateProvider(
        ddb as any,
        lambda as unknown as LambdaClient,
        'router-arn',
        'ConfigTable',
        'AuditLogTable',
        'user-1',
        'exa',
        next
      );
      expect(lambda.send).not.toHaveBeenCalled();
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/handlers/__tests__/update-provider.test.ts`
Expected: FAIL — `updateProvider` does not accept Lambda/router-arn arguments yet.

- [ ] **Step 3: Implement the gate**

Replace the body of `packages/admin-console/src/handlers/update-provider.ts` with:

```ts
import {
  GetItemCommand,
  UpdateItemCommand,
  type DynamoDBClient
} from '@aws-sdk/client-dynamodb';
import type { LambdaClient } from '@aws-sdk/client-lambda';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { z } from 'zod';
import { writeAudit } from '../audit/log';
import { probeProvider } from './probe-provider';
import type { LastVerify } from '../lib/verify-status';

export const UpdateBody = z.object({
  enabled: z.boolean(),
  quota: z.object({ rpm: z.number().int().nonnegative(), daily: z.number().int().nonnegative() }),
  timeoutMs: z.number().int().positive()
});
export type UpdateBody = z.infer<typeof UpdateBody>;

export class VerificationFailedError extends Error {
  constructor(public lastVerify: LastVerify) {
    super('VERIFICATION_FAILED');
  }
}

export async function updateProvider(
  ddb: DynamoDBClient,
  lambda: LambdaClient,
  routerArn: string,
  configTable: string,
  auditTable: string,
  actor: string,
  providerId: string,
  body: unknown
): Promise<{ providerId: string; enabled: boolean; quota: { rpm: number; daily: number }; timeoutMs: number; lastVerify?: LastVerify }> {
  const parsed = UpdateBody.parse(body);
  const key = marshall({ pk: 'provider', sk: providerId });
  const before = await ddb.send(new GetItemCommand({ TableName: configTable, Key: key }));
  if (!before.Item) throw new Error('NOT_FOUND');

  const wasEnabled = before.Item.enabled?.BOOL === true;
  const wantEnable = parsed.enabled === true && !wasEnabled;

  let lastVerify: LastVerify | undefined;
  let effectiveEnabled = parsed.enabled;
  if (wantEnable) {
    lastVerify = await probeProvider(lambda, routerArn, providerId);
    if (!lastVerify.ok) effectiveEnabled = false;
  }

  const expressionValues: Record<string, unknown> = {
    ':e': effectiveEnabled,
    ':q': parsed.quota,
    ':t': parsed.timeoutMs
  };
  let updateExpression = 'SET #enabled = :e, quota = :q, timeoutMs = :t';
  if (lastVerify) {
    expressionValues[':lv'] = lastVerify;
    updateExpression += ', lastVerify = :lv';
  }

  await ddb.send(
    new UpdateItemCommand({
      TableName: configTable,
      Key: key,
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: { '#enabled': 'enabled' },
      ExpressionAttributeValues: marshall(expressionValues)
    })
  );

  await writeAudit(ddb, auditTable, {
    actor,
    action: 'update_provider',
    target: `provider:${providerId}`,
    before: unmarshall(before.Item),
    after: { providerId, ...parsed, enabled: effectiveEnabled, ...(lastVerify ? { lastVerify } : {}) }
  });

  if (wantEnable && lastVerify && !lastVerify.ok) {
    throw new VerificationFailedError(lastVerify);
  }

  return {
    providerId,
    enabled: effectiveEnabled,
    quota: parsed.quota,
    timeoutMs: parsed.timeoutMs,
    ...(lastVerify ? { lastVerify } : {})
  };
}
```

- [ ] **Step 4: Update the BFF route to translate the error and inject the new args**

Replace `packages/admin-console/app/api/providers/[id]/route.ts` with:

```ts
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { LambdaClient } from '@aws-sdk/client-lambda';
import { updateProvider, VerificationFailedError } from '../../../../src/handlers/update-provider';

const ddb = new DynamoDBClient({});
const lambda = new LambdaClient({});

export async function PUT(req: NextRequest, ctx: { params: { id: string } }) {
  const role = req.headers.get('x-auth-role');
  if (role !== 'admin' && role !== 'editor') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const actor = req.headers.get('x-auth-sub') ?? 'unknown';
  try {
    const body = await req.json();
    const out = await updateProvider(
      ddb,
      lambda,
      process.env.SEARCH_ROUTER_ARN!,
      process.env.CONFIG_TABLE!,
      process.env.AUDIT_TABLE!,
      actor,
      ctx.params.id,
      body
    );
    return NextResponse.json(out);
  } catch (e) {
    if (e instanceof VerificationFailedError) {
      return NextResponse.json({ error: 'VERIFICATION_FAILED', lastVerify: e.lastVerify }, { status: 400 });
    }
    if ((e as Error).message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }
    return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/handlers/__tests__/update-provider.test.ts`
Expected: PASS — both the new gate cases and the existing key/reserved-word checks.

- [ ] **Step 6: Commit**

```bash
git add packages/admin-console/src/handlers/update-provider.ts \
        packages/admin-console/src/handlers/__tests__/update-provider.test.ts \
        packages/admin-console/app/api/providers/[id]/route.ts
git commit -m "feat(admin-console): gate provider enable on live router probe"
```

---

### Task 6: `test-provider` writes `lastVerify`

**Files:**
- Modify: `packages/admin-console/src/handlers/test-provider.ts`
- Modify: `packages/admin-console/src/handlers/__tests__/test-provider.test.ts`
- Modify: `packages/admin-console/app/api/providers/[id]/test/route.ts`

- [ ] **Step 1: Write the failing test**

Replace `src/handlers/__tests__/test-provider.test.ts` with:

```ts
import { describe, it, expect, vi } from 'vitest';
import { testProvider } from '../test-provider';

const enc = (obj: unknown) => Buffer.from(JSON.stringify(obj));

describe('testProvider', () => {
  it('returns ok with results count and persists lastVerify.ok=true', async () => {
    const lambda = { send: vi.fn().mockResolvedValue({ Payload: enc({ results: [{ url: 'u' }, { url: 'v' }], providersUsed: ['exa'] }) }) };
    const ddb = { send: vi.fn().mockResolvedValue({}) };
    const out = await testProvider(
      lambda as any,
      'router-arn',
      'exa',
      ddb as any,
      'ConfigTable',
      'AuditLogTable',
      'user-1',
      () => Date.parse('2026-05-28T12:00:00.000Z')
    );
    expect(out).toMatchObject({ ok: true, results: 2 });
    expect(out.lastVerify).toEqual({ at: '2026-05-28T12:00:00.000Z', ok: true });

    const updateInput = ddb.send.mock.calls[0][0].input;
    expect(updateInput.TableName).toBe('ConfigTable');
    expect(updateInput.Key).toEqual({ pk: { S: 'provider' }, sk: { S: 'exa' } });
    expect(updateInput.UpdateExpression).toMatch(/SET lastVerify = :lv/);
  });

  it('returns ok=false and persists lastVerify with code/error on router error envelope', async () => {
    const lambda = { send: vi.fn().mockResolvedValue({ Payload: enc({ error: { code: 'UPSTREAM_ERROR', message: 'UPSTREAM_ERROR: exa 401' } }) }) };
    const ddb = { send: vi.fn().mockResolvedValue({}) };
    const out = await testProvider(
      lambda as any,
      'router-arn',
      'exa',
      ddb as any,
      'ConfigTable',
      'AuditLogTable',
      'user-1',
      () => Date.parse('2026-05-28T12:00:00.000Z')
    );
    expect(out).toMatchObject({ ok: false, error: 'UPSTREAM_ERROR' });
    expect(out.lastVerify).toEqual({
      at: '2026-05-28T12:00:00.000Z',
      ok: false,
      code: 'UPSTREAM_ERROR',
      error: 'UPSTREAM_ERROR: exa 401'
    });
  });

  it('does not write to ConfigTable when configTable arg is omitted', async () => {
    const lambda = { send: vi.fn().mockResolvedValue({ Payload: enc({ results: [], providersUsed: ['exa'] }) }) };
    await testProvider(lambda as any, 'router-arn', 'exa');
    // No ddb client passed → no UpdateItem to assert on; the call simply must not throw.
    expect(lambda.send).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/handlers/__tests__/test-provider.test.ts`
Expected: FAIL — current `testProvider` does not return `lastVerify` and does not call `ddb` for ConfigTable.

- [ ] **Step 3: Rewrite `testProvider`**

Replace the body of `packages/admin-console/src/handlers/test-provider.ts` with:

```ts
import { InvokeCommand, type LambdaClient } from '@aws-sdk/client-lambda';
import { UpdateItemCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { writeAudit } from '../audit/log';
import type { LastVerify } from '../lib/verify-status';
import type { Clock } from './probe-provider';

export async function testProvider(
  lambda: LambdaClient,
  routerArn: string,
  providerId: string,
  ddb?: DynamoDBClient,
  configTable?: string,
  auditTable?: string,
  actor?: string,
  clock: Clock = Date.now
): Promise<{ ok: boolean; results?: number; error?: string; lastVerify: LastVerify }> {
  const at = new Date(clock()).toISOString();
  let body: { results?: unknown[]; error?: { code: string; message: string } };
  let lastVerify: LastVerify;

  try {
    const out = await lambda.send(
      new InvokeCommand({
        FunctionName: routerArn,
        Payload: Buffer.from(
          JSON.stringify({ toolName: `search_${providerId}`, arguments: { query: 'connectivity probe' } })
        )
      })
    );
    body = JSON.parse(new TextDecoder().decode(out.Payload));
    if (body.error) {
      lastVerify = { at, ok: false, code: body.error.code, error: body.error.message };
    } else {
      lastVerify = { at, ok: true };
    }
  } catch (e) {
    body = { error: { code: 'INVOKE_FAILED', message: (e as Error).message } };
    lastVerify = { at, ok: false, code: 'INVOKE_FAILED', error: (e as Error).message };
  }

  if (ddb && configTable) {
    await ddb.send(
      new UpdateItemCommand({
        TableName: configTable,
        Key: marshall({ pk: 'provider', sk: providerId }),
        UpdateExpression: 'SET lastVerify = :lv',
        ExpressionAttributeValues: marshall({ ':lv': lastVerify })
      })
    );
  }
  if (ddb && auditTable && actor) {
    await writeAudit(ddb, auditTable, {
      actor,
      action: 'test_provider',
      target: `provider:${providerId}`,
      after: { providerId, lastVerify }
    });
  }

  if (lastVerify.ok) {
    return { ok: true, results: body.results?.length ?? 0, lastVerify };
  }
  return { ok: false, error: lastVerify.code, lastVerify };
}
```

Note: this implementation does **not** reuse `probeProvider` because it needs the `results.length` count from the same invoke. Both functions issue the same `search_<id>` payload; keeping `testProvider` self-contained avoids a second round-trip.

- [ ] **Step 4: Update the BFF route signature**

Replace `packages/admin-console/app/api/providers/[id]/test/route.ts` with:

```ts
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { LambdaClient } from '@aws-sdk/client-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { testProvider } from '../../../../../src/handlers/test-provider';

const lambda = new LambdaClient({});
const ddb = new DynamoDBClient({});

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const role = req.headers.get('x-auth-role');
  if (role !== 'admin' && role !== 'editor') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const actor = req.headers.get('x-auth-sub') ?? 'unknown';
  try {
    const out = await testProvider(
      lambda,
      process.env.SEARCH_ROUTER_ARN!,
      ctx.params.id,
      ddb,
      process.env.CONFIG_TABLE!,
      process.env.AUDIT_TABLE!,
      actor
    );
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message || 'INTERNAL' }, { status: 502 });
  }
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run src/handlers/__tests__/test-provider.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/admin-console/src/handlers/test-provider.ts \
        packages/admin-console/src/handlers/__tests__/test-provider.test.ts \
        packages/admin-console/app/api/providers/[id]/test/route.ts
git commit -m "feat(admin-console): persist lastVerify on connectivity test"
```

---

### Task 7: `put-secret` clamps `enabled=false` and clears `lastVerify`

**Files:**
- Modify: `packages/admin-console/src/handlers/put-secret.ts`
- Modify: `packages/admin-console/src/handlers/__tests__/put-secret.test.ts`

- [ ] **Step 1: Update the failing test**

Replace `src/handlers/__tests__/put-secret.test.ts` with:

```ts
import { describe, it, expect, vi } from 'vitest';
import { putSecret } from '../put-secret';

describe('putSecret', () => {
  it('stores via PutSecretValue, then disables provider and clears lastVerify in a single UpdateItem, and writes redacted audit', async () => {
    const sm = { send: vi.fn().mockResolvedValue({ ARN: 'arn:secret:exa', VersionId: 'v1' }) };
    const ddb = {
      send: vi
        .fn()
        // GET provider to find secretArn
        .mockResolvedValueOnce({ Item: { providerId: { S: 'exa' }, secretArn: { S: 'arn:secret:exa' } } })
        // UPDATE — REMOVE lastVerify, SET enabled=false
        .mockResolvedValueOnce({})
        // AUDIT
        .mockResolvedValueOnce({})
    };
    const out = await putSecret(ddb as any, sm as any, 'ConfigTable', 'AuditLogTable', 'user-1', 'exa', 'sk_test_placeholder');
    expect(out).toEqual({ providerId: 'exa', versionId: 'v1' });

    const getKey = ddb.send.mock.calls[0][0].input.Key;
    expect(getKey).toEqual({ pk: { S: 'provider' }, sk: { S: 'exa' } });

    const updateInput = ddb.send.mock.calls[1][0].input;
    expect(updateInput.Key).toEqual({ pk: { S: 'provider' }, sk: { S: 'exa' } });
    expect(updateInput.UpdateExpression).toMatch(/SET #enabled = :e REMOVE lastVerify/);
    expect(updateInput.ExpressionAttributeNames).toMatchObject({ '#enabled': 'enabled' });
    expect(updateInput.ExpressionAttributeValues).toMatchObject({ ':e': { BOOL: false } });

    const auditStr = JSON.stringify(ddb.send.mock.calls[2][0].input);
    expect(auditStr).not.toContain('sk_test_placeholder');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/handlers/__tests__/put-secret.test.ts`
Expected: FAIL — current implementation does not issue an UpdateItem.

- [ ] **Step 3: Implement**

Replace the body of `packages/admin-console/src/handlers/put-secret.ts` with:

```ts
import {
  GetItemCommand,
  UpdateItemCommand,
  type DynamoDBClient
} from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { PutSecretValueCommand, type SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { writeAudit } from '../audit/log';

export async function putSecret(
  ddb: DynamoDBClient,
  sm: SecretsManagerClient,
  configTable: string,
  auditTable: string,
  actor: string,
  providerId: string,
  value: string
): Promise<{ providerId: string; versionId: string }> {
  if (!value || value.length < 8) throw new Error('INVALID_INPUT');
  const key = marshall({ pk: 'provider', sk: providerId });
  const cfg = await ddb.send(new GetItemCommand({ TableName: configTable, Key: key }));
  const arn = cfg.Item?.secretArn?.S;
  if (!arn) throw new Error('NOT_FOUND');
  const out = await sm.send(new PutSecretValueCommand({ SecretId: arn, SecretString: value }));

  await ddb.send(
    new UpdateItemCommand({
      TableName: configTable,
      Key: key,
      UpdateExpression: 'SET #enabled = :e REMOVE lastVerify',
      ExpressionAttributeNames: { '#enabled': 'enabled' },
      ExpressionAttributeValues: marshall({ ':e': false })
    })
  );

  await writeAudit(ddb, auditTable, {
    actor,
    action: 'put_secret',
    target: `provider:${providerId}`,
    after: { versionId: out.VersionId, enabled: false, lastVerifyCleared: true }
  });
  return { providerId, versionId: out.VersionId! };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/handlers/__tests__/put-secret.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/admin-console/src/handlers/put-secret.ts \
        packages/admin-console/src/handlers/__tests__/put-secret.test.ts
git commit -m "feat(admin-console): clamp enabled=false on secret rotation"
```

---

### Task 8: `ProviderList` Verification badge

**Files:**
- Modify: `packages/admin-console/src/views/ProviderList.tsx`
- Modify: `packages/admin-console/src/views/__tests__/ProviderList.test.tsx`

- [ ] **Step 1: Write the failing test**

Append the following to `src/views/__tests__/ProviderList.test.tsx` (keep existing tests intact). If the existing rows do not include `lastVerify`, add it where appropriate so the column has data to render.

```tsx
it('renders the four verification badges based on lastVerify', () => {
  const isoNow = new Date().toISOString();
  const isoStale = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  render(
    <ProviderList
      rows={[
        { providerId: 'a', enabled: true, hasSecret: true, quota: { rpm: 10, daily: 100 }, timeoutMs: 8000, lastVerify: { at: isoNow, ok: true } },
        { providerId: 'b', enabled: true, hasSecret: true, quota: { rpm: 10, daily: 100 }, timeoutMs: 8000, lastVerify: { at: isoStale, ok: true } },
        { providerId: 'c', enabled: false, hasSecret: true, quota: { rpm: 10, daily: 100 }, timeoutMs: 8000, lastVerify: { at: isoNow, ok: false, code: 'UPSTREAM_ERROR', error: '401' } },
        { providerId: 'd', enabled: false, hasSecret: false, quota: { rpm: 10, daily: 100 }, timeoutMs: 8000 }
      ]}
    />
  );
  expect(screen.getByText('Verified')).toBeInTheDocument();
  expect(screen.getByText('Verification stale')).toBeInTheDocument();
  expect(screen.getByText('Verification failed')).toBeInTheDocument();
  expect(screen.getByText('Unverified')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/views/__tests__/ProviderList.test.tsx`
Expected: FAIL — none of the verification badge texts exist yet.

- [ ] **Step 3: Implement**

Edit `packages/admin-console/src/views/ProviderList.tsx`:

1. Add this import near the existing imports:

```tsx
import { getVerifyStatus, type VerifyStatus } from '../lib/verify-status';
```

2. Add a Verification column header between the existing `Status` and `Secret` `<th>`s:

```tsx
<th className="text-left px-5 py-3 font-medium">Verification</th>
```

3. Add a matching `<td>` between the Status and Secret cells inside `slice.map`:

```tsx
<td className="px-5 py-3">
  <VerifyBadge status={getVerifyStatus(r.lastVerify)} reason={r.lastVerify?.error ?? r.lastVerify?.code} />
</td>
```

4. Add the `VerifyBadge` component at the bottom of the file:

```tsx
function VerifyBadge({ status, reason }: { status: VerifyStatus; reason?: string }) {
  if (status === 'verified') return <Badge tone="success">Verified</Badge>;
  if (status === 'stale') return <Badge tone="warning">Verification stale</Badge>;
  if (status === 'failed')
    return (
      <Badge tone="error" title={reason ?? undefined}>
        Verification failed
      </Badge>
    );
  return <Badge tone="neutral">Unverified</Badge>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/views/__tests__/ProviderList.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/admin-console/src/views/ProviderList.tsx \
        packages/admin-console/src/views/__tests__/ProviderList.test.tsx
git commit -m "feat(admin-console): add Verification column to provider list"
```

---

### Task 9: `ProviderDetail` — Save flow + Secret-tab helper

**Files:**
- Modify: `packages/admin-console/src/views/ProviderDetail.tsx`
- Modify: `packages/admin-console/src/views/__tests__/ProviderDetail.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append these cases to `src/views/__tests__/ProviderDetail.test.tsx`. Keep all existing tests intact.

```tsx
import { ApiError } from '../../lib/api';

it('reverts the Enabled toggle and toasts on VERIFICATION_FAILED', async () => {
  const api = makeApi(); // existing helper that returns mock callable methods
  api.updateProvider = vi.fn().mockRejectedValue(
    Object.assign(new ApiError(400, 'VERIFICATION_FAILED'), {
      lastVerify: { at: new Date().toISOString(), ok: false, code: 'UPSTREAM_ERROR', error: '401' }
    })
  );
  const initial = {
    providerId: 'exa',
    enabled: false,
    hasSecret: true,
    quota: { rpm: 10, daily: 100 },
    timeoutMs: 8000
  };
  render(<ProviderDetail initial={initial} api={api} />);
  fireEvent.click(screen.getByRole('tab', { name: /Configuration/i }));
  const checkbox = screen.getByLabelText(/Enabled/i) as HTMLInputElement;
  fireEvent.click(checkbox);
  expect(checkbox.checked).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: /Save changes/i }));
  await waitFor(() => expect(checkbox.checked).toBe(false));
  expect(screen.getByText(/Verification failed/i)).toBeInTheDocument();
});

it('surfaces the disabled-after-secret helper after Store new version', async () => {
  const api = makeApi();
  api.putSecret = vi.fn().mockResolvedValue({ providerId: 'exa', versionId: 'v2' });
  const initial = {
    providerId: 'exa',
    enabled: true,
    hasSecret: true,
    quota: { rpm: 10, daily: 100 },
    timeoutMs: 8000,
    lastVerify: { at: new Date().toISOString(), ok: true }
  };
  render(<ProviderDetail initial={initial} api={api} />);
  fireEvent.click(screen.getByRole('tab', { name: /Secret/i }));
  fireEvent.change(screen.getByLabelText(/Enter new secret value/i), {
    target: { value: 'sk_new_key_123' }
  });
  fireEvent.click(screen.getByRole('button', { name: /Store new version/i }));
  await screen.findByText(/Verification reset and provider disabled/i);
});
```

If `makeApi()` does not exist in the test file, add it next to other helpers:

```tsx
function makeApi(): Api {
  return {
    updateProvider: vi.fn().mockResolvedValue({ providerId: 'exa', enabled: true, quota: { rpm: 10, daily: 100 }, timeoutMs: 8000 }),
    putSecret: vi.fn().mockResolvedValue({ providerId: 'exa', versionId: 'v1' }),
    revealSecret: vi.fn().mockResolvedValue({ providerId: 'exa', value: 'sk' }),
    testProvider: vi.fn().mockResolvedValue({ ok: true, results: 1, lastVerify: { at: new Date().toISOString(), ok: true } })
  };
}
```

- [ ] **Step 2: Adjust `ApiError` to carry `lastVerify`**

In `packages/admin-console/src/lib/api.ts`, replace the `ApiError` class with:

```ts
import type { LastVerify } from './verify-status';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message?: string, public lastVerify?: LastVerify) {
    super(message ?? code);
  }
}
```

Then replace the `call` helper so the error path forwards `lastVerify` from the response body:

```ts
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(resolveUrl(path), { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) {
    const code = (body.error as string) ?? 'UNKNOWN';
    const lv = body.lastVerify as LastVerify | undefined;
    throw new ApiError(res.status, code, undefined, lv);
  }
  return body as T;
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run src/views/__tests__/ProviderDetail.test.tsx`
Expected: FAIL — toggle does not revert and helper text is missing.

- [ ] **Step 4: Implement the view changes**

Edit `packages/admin-console/src/views/ProviderDetail.tsx`:

1. Replace the existing Save handler in the Configuration tab so it reverts `enabled` and surfaces the reason on `VERIFICATION_FAILED`:

```tsx
import { adminApi as defaultApi, ApiError, type ProviderRow } from '../lib/api';

// inside the Save button onClick:
onClick={async () => {
  setSavingConfig(true);
  try {
    await api.updateProvider(initial.providerId, {
      enabled,
      quota: { rpm, daily },
      timeoutMs
    });
    toast.push('Configuration saved & verified', 'success');
  } catch (e) {
    if (e instanceof ApiError && e.code === 'VERIFICATION_FAILED') {
      setEnabled(false);
      const reason = e.lastVerify?.error ?? e.lastVerify?.code ?? 'unknown';
      toast.push(`Verification failed: ${reason}. Toggle stays off.`, 'error');
    } else {
      toast.push((e as Error).message ?? 'Save failed', 'error');
    }
  } finally {
    setSavingConfig(false);
  }
}}
```

Also update the Save button label so it switches while a verifying save is in flight:

```tsx
{savingConfig ? (enabled !== initial.enabled && enabled ? 'Verifying & saving…' : 'Saving…') : 'Save changes'}
```

2. After the existing `<Button>{storingSecret ? 'Storing…' : 'Store new version'}</Button>` block in the Secret tab, render the helper text after a successful store. Track success in local state:

```tsx
const [secretJustRotated, setSecretJustRotated] = useState(false);
```

Then in the Secret tab after the store button row, add:

```tsx
{secretJustRotated && (
  <p className="mt-3 text-caption-sm text-charcoal">
    Verification reset and provider disabled — re-verify before re-enabling.
  </p>
)}
```

And inside the existing `putSecret` `try` block, on success call `setSecretJustRotated(true)`. On error call `setSecretJustRotated(false)`.

3. In the header card, replace the existing `Secret stored` badge block with a stack that also renders the verification badge:

```tsx
import { getVerifyStatus } from '../lib/verify-status';

// inside the header card, replacing the lone hasSecret badge:
<Badge tone={initial.hasSecret ? 'neutral' : 'warning'}>
  {initial.hasSecret ? 'Secret stored' : 'No secret'}
</Badge>
<VerifyBadge status={getVerifyStatus(initial.lastVerify)} reason={initial.lastVerify?.error ?? initial.lastVerify?.code} />
```

Add the same `VerifyBadge` helper at the bottom of `ProviderDetail.tsx` as in Task 8 (or extract it into `src/ui/VerifyBadge.tsx` and import from both views — see Task 10).

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run src/views/__tests__/ProviderDetail.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/admin-console/src/views/ProviderDetail.tsx \
        packages/admin-console/src/views/__tests__/ProviderDetail.test.tsx \
        packages/admin-console/src/lib/api.ts
git commit -m "feat(admin-console): wire ProviderDetail to verified-enable gate"
```

---

### Task 10: Extract `VerifyBadge` into a shared UI primitive (optional cleanup)

**Files:**
- Create: `packages/admin-console/src/ui/VerifyBadge.tsx`
- Modify: `packages/admin-console/src/views/ProviderList.tsx`, `packages/admin-console/src/views/ProviderDetail.tsx`

This task removes the duplicated `VerifyBadge` body from the two views.

- [ ] **Step 1: Create the component**

```tsx
// packages/admin-console/src/ui/VerifyBadge.tsx
import React from 'react';
import { Badge } from './Badge';
import type { VerifyStatus } from '../lib/verify-status';

export function VerifyBadge({ status, reason }: { status: VerifyStatus; reason?: string }) {
  if (status === 'verified') return <Badge tone="success">Verified</Badge>;
  if (status === 'stale') return <Badge tone="warning">Verification stale</Badge>;
  if (status === 'failed')
    return (
      <Badge tone="error" title={reason ?? undefined}>
        Verification failed
      </Badge>
    );
  return <Badge tone="neutral">Unverified</Badge>;
}
```

- [ ] **Step 2: Replace inline definitions in both views with imports**

In `ProviderList.tsx` and `ProviderDetail.tsx`, remove the local `VerifyBadge` function and add:

```tsx
import { VerifyBadge } from '../ui/VerifyBadge';
```

- [ ] **Step 3: Run all admin-console tests**

Run: `pnpm vitest run`
Expected: 22+ files pass, no regressions.

- [ ] **Step 4: Commit**

```bash
git add packages/admin-console/src/ui/VerifyBadge.tsx \
        packages/admin-console/src/views/ProviderList.tsx \
        packages/admin-console/src/views/ProviderDetail.tsx
git commit -m "refactor(admin-console): extract VerifyBadge into shared UI primitive"
```

---

### Task 11: One-shot migration script

**Files:**
- Create: `infra/scripts/migrate-config-disable-unverified.ts`

- [ ] **Step 1: Write the script**

```ts
// infra/scripts/migrate-config-disable-unverified.ts
import {
  DynamoDBClient,
  ScanCommand,
  UpdateItemCommand,
  PutItemCommand
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const CONFIG_TABLE = process.env.CONFIG_TABLE;
const AUDIT_TABLE = process.env.AUDIT_TABLE;
const REGION = process.env.AWS_REGION ?? 'us-east-1';
const DRY_RUN = process.argv.includes('--dry-run');

if (!CONFIG_TABLE || !AUDIT_TABLE) {
  console.error('CONFIG_TABLE and AUDIT_TABLE env vars are required');
  process.exit(1);
}

const ddb = new DynamoDBClient({ region: REGION });

async function main() {
  const out = await ddb.send(new ScanCommand({ TableName: CONFIG_TABLE }));
  const items = out.Items ?? [];
  const at = new Date().toISOString();
  let touched = 0;

  for (const raw of items) {
    const r = unmarshall(raw) as { providerId: string; pk: string; sk: string; enabled: boolean };
    if (r.pk !== 'provider') continue;

    const lastVerify = { at, ok: false, error: 'migration: never verified', code: 'MIGRATION' };
    console.log(
      `${DRY_RUN ? '[dry-run] ' : ''}provider=${r.providerId} enabled ${r.enabled} → false; lastVerify.code=MIGRATION`
    );

    if (DRY_RUN) continue;

    await ddb.send(
      new UpdateItemCommand({
        TableName: CONFIG_TABLE,
        Key: marshall({ pk: 'provider', sk: r.providerId }),
        UpdateExpression: 'SET #enabled = :e, lastVerify = :lv',
        ExpressionAttributeNames: { '#enabled': 'enabled' },
        ExpressionAttributeValues: marshall({ ':e': false, ':lv': lastVerify })
      })
    );

    await ddb.send(
      new PutItemCommand({
        TableName: AUDIT_TABLE,
        Item: marshall({
          actor: 'migration:disable-unverified',
          ts: at,
          action: 'migration_disable_unverified',
          target: `provider:${r.providerId}`,
          before: { enabled: r.enabled },
          after: { enabled: false, lastVerify }
        })
      })
    );
    touched += 1;
  }

  console.log(`${DRY_RUN ? '[dry-run] ' : ''}done. providers touched: ${touched}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Smoke-run with `--dry-run`**

Set the same env vars the admin-console reads from `.env.local`:

```bash
cd infra
CONFIG_TABLE=SearchGatewayStack-v1-0-ConfigTableAD5E05DF-NHSD5F13X6S4 \
AUDIT_TABLE=SearchGatewayStack-v1-0-AuditLogTable8B03E3C8-1LKUH9FE7FNQB \
pnpm tsx scripts/migrate-config-disable-unverified.ts --dry-run
```

Expected: one `provider=<id> enabled true → false` line per row, ending with `done. providers touched: 0` (dry-run does not increment).

- [ ] **Step 3: Commit**

```bash
git add infra/scripts/migrate-config-disable-unverified.ts
git commit -m "chore(infra): add one-shot migration to disable unverified providers"
```

- [ ] **Step 4: Run for real (operator action — not part of automated CI)**

```bash
cd infra
CONFIG_TABLE=SearchGatewayStack-v1-0-ConfigTableAD5E05DF-NHSD5F13X6S4 \
AUDIT_TABLE=SearchGatewayStack-v1-0-AuditLogTable8B03E3C8-1LKUH9FE7FNQB \
pnpm tsx scripts/migrate-config-disable-unverified.ts
```

Expected: each provider line, ending with `done. providers touched: <N>`.

This step is intentionally manual; do not bake it into deploy automation.

---

### Task 12: Final regression sweep

**Files:** none — verification only.

- [ ] **Step 1: Run all admin-console tests**

Run: `cd packages/admin-console && pnpm vitest run`
Expected: all suites green; counts at least match the pre-task baseline (22 files / 61 tests) plus the new ones.

- [ ] **Step 2: Run search-router tests**

Run: `cd packages/search-router && pnpm vitest run`
Expected: 5 files / 17+ tests pass.

- [ ] **Step 3: Type-check admin-console**

Run: `cd packages/admin-console && pnpm tsc --noEmit`
Expected: no new errors versus the pre-existing baseline failure in `playground-search.test.ts:31` (unrelated, tracked separately).

- [ ] **Step 4: Manual UI smoke (optional, only if a dev DB and AWS creds are available)**

In `packages/admin-console`:

```bash
pnpm dev
```

Open http://localhost:3000/admin/providers and confirm:
- Each row shows one of `Verified` / `Verification stale` / `Verification failed` / `Unverified`.
- Toggling Enabled on a provider with a real key persists; on a provider with a placeholder key, the toggle bounces back to off and an error toast surfaces the reason.
- Saving a new secret bounces Enabled to off and shows the helper text.

If the dev DB is not available, document this step as deferred to staging.
