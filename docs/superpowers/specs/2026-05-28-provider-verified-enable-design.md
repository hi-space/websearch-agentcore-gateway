# Provider Verified-Enable Gate — Design

Status: proposed
Date: 2026-05-28
Owner: hi-space
Scope: admin-console handlers + UI, ConfigTable schema, one-shot migration

## Background

ConfigTable currently shows every provider as `enabled: true` with a `secretArn` populated, even though the corresponding Secrets Manager values are dummy strings (e.g. `test-placeholder-arxiv`) left over from an out-of-band dev/demo session. The admin UI faithfully reflects this state, so operators see "Enabled / Secret stored" for providers that cannot actually serve traffic.

Root cause is the data model, not the UI: `enabled` is captured as bare operator intent with no link to whether the credential actually works. The fix is to make `enabled = true` mean "verified to work recently" — never just "operator clicked the toggle."

## Goals

- `enabled = true` in ConfigTable implies the provider responded with a 2xx to a connectivity probe within a known TTL.
- Operator can re-verify on demand from the UI.
- No background cron, no extra infra. The gate runs inline in the existing admin handlers.
- Backwards compatible: rows without verification metadata keep working; the UI just shows them as `Unverified`.

## Non-goals

- Per-tenant or per-region verification.
- Automatic recurring re-verification (cron / EventBridge).
- Verifying upstream auth scopes/quotas beyond a single 2xx.
- Cleaning up the dummy Secrets Manager payloads. Those are harmless once `enabled` flips to false.

## Architecture

`ConfigTable.enabled = true` is the single source of truth for "this provider is hot." The admin handlers are responsible for never letting that bit flip on without a fresh successful probe.

Components:

- **ConfigTable row** — gains an optional `lastVerify` map: `{ at: ISO string, ok: boolean, error?: string, code?: string }`.
- **search-router invoke gate** — admin-console BFF invokes the existing search-router Lambda with `search_<id>` to probe upstream. No new Lambda.
- **`handlers/update-provider`** — detects the OFF→ON enabled transition, runs the probe, writes `lastVerify`, and clamps `enabled = false` on failure.
- **`handlers/test-provider`** — keeps its existing role but now also writes `lastVerify` and returns it in the response.
- **`handlers/put-secret`** — on success, removes `lastVerify` from the row so the next enable forces a re-verify.
- **`handlers/list-providers` / `ProviderRow`** — surfaces `lastVerify` to the UI.
- **search-router** — unchanged. It already trusts ConfigTable.enabled, and now that bit is meaningful.

State transitions:

```
disabled --operator toggles ON--> probe --2xx--> enabled (lastVerify.ok=true)
                                       \--fail--> disabled retained
                                                  (lastVerify.ok=false, reason recorded)

enabled  --operator toggles OFF--> disabled (lastVerify retained)

(any)    --"Run connectivity test"--> probe --> lastVerify updated; enabled untouched

(any)    --putSecret success--> lastVerify removed; enabled clamped to false
```

## Data flow / API contracts

### ConfigTable item

```json
{
  "pk": { "S": "provider" },
  "sk": { "S": "<providerId>" },
  "providerId": "<providerId>",
  "enabled": true,
  "secretArn": "arn:...",
  "quota": { "M": { "rpm": ..., "daily": ... } },
  "timeoutMs": 8000,
  "lastVerify": {
    "M": {
      "at": { "S": "2026-05-28T08:31:00Z" },
      "ok": { "BOOL": true }
    }
  }
}
```

On failure the map carries `error` (raw upstream message or short reason) and `code` (e.g. `UPSTREAM_ERROR`, `INVOKE_FAILED`, `MIGRATION`).

### `PUT /api/providers/[id]` (behavior change)

Request body unchanged: `{ enabled, quota, timeoutMs }`.

Handler flow:

1. Zod-parse the body. Read the existing row.
2. Compute `wantEnable = parsed.enabled === true && before.enabled !== true`.
3. If `wantEnable`:
   - Invoke search-router Lambda with `{ toolName: 'search_<id>', arguments: { query: 'connectivity probe' } }`.
   - If the response carries `results`, set `lastVerify = { at: now, ok: true }` and persist `enabled = true`.
   - If the response carries `error`, set `lastVerify = { at: now, ok: false, error: error.message, code: error.code }`, persist `enabled = false`, and return HTTP 400 `{ error: 'VERIFICATION_FAILED', lastVerify }`.
   - If invoke itself throws, set `lastVerify = { at: now, ok: false, error: e.message, code: 'INVOKE_FAILED' }`, persist `enabled = false`, return HTTP 400.
4. If not `wantEnable`, persist quota/timeout/enabled as-is. `lastVerify` is untouched.
5. Audit row carries the full before/after, including `lastVerify`.

### `POST /api/providers/[id]/test` (behavior change)

Same probe path as today, but the result is also written back as `lastVerify` on the ConfigTable row. Response body grows a `lastVerify` field. `enabled` is never modified by this endpoint.

### `POST /api/providers/[id]/secret` (behavior change)

After `PutSecretValue` succeeds, the handler issues a single DDB `UpdateItem` that both `REMOVE`s `lastVerify` and `SET enabled = false`. The new key is never considered hot until the operator re-verifies via the Configuration tab. The audit row records the enabled flip alongside the secret rotation.

### `GET /api/providers` (response shape)

`ProviderRow` adds `lastVerify?: { at: string; ok: boolean; error?: string; code?: string }`. `list-providers` passes it through from `unmarshall`.

### IAM

`update-provider` invokes the same search-router ARN that `test-provider` already uses. The admin Lambda role already has `lambda:InvokeFunction` against that ARN, so no IAM change is required (verify in `infra/lib/stacks/admin-console-stack.ts` during implementation).

### Failure / edge cases

- search-router Lambda timeout (8 s) bounds probe latency end-to-end. The admin handler relies on that.
- Concurrent toggles: not guarded by DDB conditional writes in v1. Last write wins; acceptable for the small operator audience.
- Quota exhaustion during probe: probe consumes one quota slot via `quota.consume`. Acceptable — provider quota is set per minute/day and a probe is one call.

## UI changes

### `ProviderList`

Adds a Verification column. Badge selection:

| Condition | Badge |
| --- | --- |
| `lastVerify.ok === true` and `now - at <= 1 h` | `Verified` (success) |
| `lastVerify.ok === true` and `now - at > 1 h` | `Verification stale` (warning) |
| `lastVerify.ok === false` | `Verification failed` (error, with `error/code` in title attribute) |
| `lastVerify` absent | `Unverified` (neutral) |

Filter pills are not extended in v1 (low provider count makes scanning sufficient).

### `ProviderDetail`

- Header card carries the same Verification badge alongside the existing Enabled / Secret badges. Failure detail (`Last verify failed: <code> (<at>)`) is rendered as small helper text under the heading.
- Configuration tab Save:
  - When Enabled flips OFF→ON, the button label becomes `Verifying & saving…` with a spinner while the request is in flight.
  - On 400 `VERIFICATION_FAILED`, the toggle reverts to `false` (using the `lastVerify` returned in the error body), an error toast surfaces the reason, and the form remains dirty so the operator can retry.
  - On success, the toast reads `Configuration saved & verified`.
- Existing Run connectivity test button updates the header badge and Activity panel from the `lastVerify` returned in the response.
- Secret tab — after `Store new version` succeeds, render helper text: `Verification reset and provider disabled — re-verify before re-enabling.` The page refetches `ProviderRow` so the header `Enabled` badge flips to `Disabled`.

### `ProviderRow` (`src/lib/api.ts`)

Add `lastVerify` to the type. Update `testProvider` return type to include `lastVerify`.

### Helper

New `src/lib/verify-status.ts` exporting `getVerifyStatus(lastVerify, now = Date.now()) → 'verified' | 'stale' | 'failed' | 'unverified'`. The fresh window (1 hour) is a constant `VERIFY_FRESH_MS = 60 * 60 * 1000` exported from the same module.

## Testing

### Unit (vitest)

- `src/handlers/__tests__/update-provider.test.ts`
  - OFF→ON + probe success: search-router mock returns `{ results: [...] }`. Asserts the UpdateItem includes `enabled = true` and `lastVerify.ok = true`. Response 200.
  - OFF→ON + probe `{ error }`: UpdateItem clamps `enabled = false`, records `lastVerify.ok = false` with `code` and `error`. Response 400 `VERIFICATION_FAILED`.
  - OFF→ON + invoke throws: `lastVerify.code = 'INVOKE_FAILED'`. Response 400.
  - ON→ON / ON→OFF / quota-only update: Lambda mock is never called.
  - Existing Key / reserved-word checks remain.
- `src/handlers/__tests__/test-provider.test.ts`
  - Probe result is persisted to `lastVerify` via UpdateItem and echoed in the response.
  - Probe failure leaves `enabled` alone but updates `lastVerify`.
- `src/handlers/__tests__/put-secret.test.ts`
  - On success, a single `UpdateItem` is observed that both `REMOVE`s `lastVerify` and sets `enabled = false`.
- `src/lib/__tests__/verify-status.test.ts` (new)
  - Boundary cases: `at = now - 59 m / 60 m / 61 m`, `ok=false`, `lastVerify` undefined.

### View (jsdom + Testing Library)

- `src/views/__tests__/ProviderList.test.tsx` — four `lastVerify` shapes render the four badges.
- `src/views/__tests__/ProviderDetail.test.tsx`
  - Toggling Enabled ON and saving while the API mock rejects with `VERIFICATION_FAILED` rolls the checkbox back to `false` and surfaces the error toast.
  - `Store new version` success path renders the reset helper text.

### Out of scope

End-to-end tests against real upstreams. Handler/UI coverage is sufficient for v1.

## Migration

The current ConfigTable holds dev-leftover rows: every provider is `enabled = true` with placeholder secrets. The migration converts that to a clean baseline before the new gate matters.

1. Ship the code (backwards compatible — rows without `lastVerify` render as `Unverified`).
2. Run `infra/scripts/migrate-config-disable-unverified.ts` once. The script:
   - Scans ConfigTable.
   - For each provider row, issues `UpdateItem` setting `enabled = false` and `lastVerify = { at: now, ok: false, error: 'migration: never verified', code: 'MIGRATION' }`.
   - Supports `--dry-run` for preview.
   - Is idempotent (re-running is a no-op against already-disabled rows; we still rewrite `lastVerify` for traceability).
   - Writes one audit row per affected provider with `actor = 'migration:disable-unverified'`.
   - Prints a one-line summary per row and a totals line.
3. Operator workflow afterwards, per provider:
   - Open admin UI → Secret tab → `Store new version` with the real key.
   - Configuration tab → flip Enabled ON → Save. The handler probes; on success the row goes hot.
   - On probe failure the toggle bounces back to OFF with the reason in `lastVerify`.
4. Dummy Secrets Manager values are left in place (harmless once `enabled = false`). Optional cleanup is an ops chore, not part of this spec.

## Rollout / rollback

- Code change is additive; old rows still load and render. Safe to deploy ahead of the migration script.
- The migration only flips `enabled` from `true` to `false` and adds `lastVerify`. Worst case (we change our minds) is operators flipping providers back on through the UI — same recovery path as normal operation.
- No infra changes, no IAM changes, no new resources to roll back.

## Open questions

None blocking. (Conditional-write race protection and an automated re-verification cron can be follow-ups if operator scale grows.)
