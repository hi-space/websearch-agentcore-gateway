# Search AgentCore Gateway — Design

- Status: Draft (awaiting user review)
- Author: Hi-space + Claude
- Date: 2026-05-23
- Audience: Enterprise customers deploying into their own AWS account

---

## 1. Problem & Goals

### 1.1 Problem
Claude 1P models include built-in web search; Bedrock 3P models do not. Customers
who want to use Bedrock 3P models (or any LLM/agent framework that speaks MCP)
need a uniform, secure, observable way to attach search capabilities. Wiring up
each search provider individually — credentials, quotas, retries, observability,
multi-tenant secrets — is repetitive and error-prone.

### 1.2 Goals (v1)
1. **Drop-in search for any LLM client** — expose search providers as MCP tools
   via Amazon Bedrock AgentCore Gateway, consumable from Claude Desktop, Cursor,
   Cline, AgentCore Runtime agents, or direct Bedrock Converse code.
2. **Easy configuration** — adding/removing providers, rotating keys, and
   adjusting quotas should be a low-friction path; provider activation lives in
   a single source of truth and is changeable at runtime by an admin.
3. **Cost & usage control** — per-provider observation, hard quotas where
   technically feasible, soft quotas + alarms otherwise, and an estimated cost
   view per provider.
4. **Enterprise-grade security** — VPC isolation, KMS CMKs, WAF, Cognito MFA,
   audit logs, least-privilege IAM, cdk-nag enforced.
5. **Result post-processing** — `search_unified` meta-tool fans out to enabled
   providers, deduplicates by URL, and re-ranks results (Reciprocal Rank
   Fusion).
6. **CDK (TypeScript) deployment** — single stack, deployable into a customer
   account, optional reuse of an existing VPC.

### 1.3 Non-goals (v1)
- Multi-tenancy / SaaS hosting (code is structured tenant-ready, but only
  `default` tenant is exercised; multi-tenancy is v2).
- Automatic key rotation (framework + alarms only; manual rotation supported).
- SAML / OIDC federation (Cognito email + password + MFA only; v2).
- News / Code / Internal-search categories shipped as built-ins (provider
  adapter SDK + sample adapters in `examples/` only; v2 ships these as
  defaults).
- Multi-region failover.
- Including built-in (Tavily/Brave) results inside `search_unified` (v1.5).

### 1.4 Primary user personas
- **Enterprise platform engineer** — deploys via `cdk deploy`, reuses existing
  VPC, sets budget/alarm thresholds.
- **Search admin (operator)** — uses the admin console to enable providers,
  rotate keys, set quotas, watch dashboards.
- **LLM client / agent developer** — integrates the MCP endpoint into their
  client; never thinks about provider keys.

---

## 2. Scope

### 2.1 v1 providers

| Category | Provider | Implementation | Quota mode |
|---|---|---|---|
| Web | Tavily | AgentCore built-in integration | soft (alarm-only) |
| Web | Brave | AgentCore built-in integration | soft (alarm-only) |
| Web | Exa | Lambda adapter | hard (DDB-counter, 429) |
| Web | SearXNG (self-hosted) | Lambda adapter → internal ALB → Fargate | hard |
| Academic | arXiv | Lambda adapter | hard |
| Academic | PubMed | Lambda adapter | hard |
| Academic | Semantic Scholar | Lambda adapter | hard |

### 2.2 v1 surfaces
- MCP endpoint via AgentCore Gateway (the data-plane consumed by clients)
- Admin web console (CloudFront → S3 → API Gateway → Admin Lambda)
- CloudWatch dashboards & SNS alarms (machine-facing observability layer)
- Audit log surface (DDB + S3 Object Lock)

### 2.3 Out of scope for v1 — listed explicitly
- Multi-tenancy, SaaS, marketplace listing
- Built-in code/news adapters (samples only)
- Built-in internal-search adapters (Confluence sample only)
- `answer_with_search` / synthesis tools (v2)
- Automatic provider key rotation that actually mints keys (provider APIs
  generally don't support it)
- Including Tavily/Brave inside `search_unified` (v1.5)

---

## 3. Configuration & lifecycle decisions

### 3.1 Selection unit, activation model, and key handling
- **Per-provider toggle.** Each provider has its own enabled/disabled state.
- **Runtime toggle (P-model).** Provider Lambdas and Secrets-Manager slots are
  always deployed; activation lives in DynamoDB ConfigTable. Disabled providers
  are simply not registered as Gateway tools. (NB: this is a change from an
  earlier "IaC conditional synthesis" idea — required because the admin console
  is the source of truth.)
- **Fargate-backed providers (SearXNG) are scaled to 0 when disabled.** The
  ECS service is always defined in the stack, but the admin sync flow sets
  `desiredCount = 0` while disabled and `1` while enabled, so a customer who
  never turns SearXNG on never pays for a running task.
- **Source of truth = ConfigTable in DynamoDB.** A YAML
  (`search-providers.example.yaml`) is shipped as a bootstrap seed only.
- **Explicit activation + key validation gate.** Activation requires either a
  registered Secrets Manager ARN (Lambda providers) or an AgentCore Identity
  credential reference (built-in providers). On activation, the Admin Lambda
  pings the provider; failure rolls back the secret version and the config
  change.

### 3.2 Secret management
- Hybrid:
  - **Built-in (Tavily, Brave):** AgentCore Identity API-key credential
    provider.
  - **Custom Lambda providers:** AWS Secrets Manager, KMS-CMK encrypted, with
    resource policies restricting access to provider Lambdas only.
- Plaintext keys never persist anywhere except Secrets Manager. Provider
  Lambdas use a 5-minute in-memory cache.
- **Rotation:** manual rotation is the supported workflow. Secrets Manager
  rotation Lambda **template** is shipped (in `examples/`) for customers who
  can implement provider-specific rotation. A "secret last rotated > 90 days"
  alarm fires by default.

### 3.3 Quota model
- **Lambda providers (Exa, SearXNG, arXiv, PubMed, Semantic Scholar):** hard
  quota. DDB QuotaTable counter with conditional increment; over-quota →
  return MCP `RATE_LIMITED` error with `retryAfterSec` hint.
- **Built-in providers (Tavily, Brave):** soft quota. CloudWatch alarms only;
  the AgentCore data path bypasses our code, so we cannot enforce. The
  trade-off is documented in `docs/operations.md` and labelled in the admin UI.

### 3.4 Sync model (admin → Gateway)
- **Synchronous.** Admin Lambda writes ConfigTable, then calls AgentCore
  Gateway control-plane APIs to register/deregister/update targets and tools,
  then writes audit log. All within a single request, with rollback on failure.
- **Reconciler.** A 15-minute scheduled Lambda compares ConfigTable to the
  Gateway state and corrects drift; emits a `ConfigDriftDetected` alarm.

### 3.5 Authentication
- **Cognito User Pool** with email + password + MFA (TOTP or SMS).
- **Roles:** `Admins` and `Viewers` (Cognito groups → ID-token claim → API
  Gateway authorizer → IAM scope).
- Advanced security on (compromised credentials, adaptive auth).
- **Step-up MFA** is required for high-risk admin actions (secret reveal).

### 3.6 Secret reveal (high-risk admin action)
Plain-text reveal is supported in v1 with the following non-negotiable guards:
1. Admin role only (Viewer cannot invoke the endpoint at all)
2. Step-up MFA — implemented as a dedicated `/auth/step-up` flow that issues a
   short-lived (5 min) `mfa_assertion` token signed by the Admin Lambda's KMS
   key; the reveal endpoint only accepts requests carrying a valid, unused
   assertion (Cognito advanced auth + custom challenge).
3. Mandatory free-text "reason" field, recorded in audit log
4. AuditLogTable + S3 immutable archive + CloudTrail data event for every
   reveal
5. Per-session reveal cap: > 5 reveals/hour triggers automatic block + alarm
6. UI default is masked; explicit "Show" exposes plaintext for 30 sec then
   auto-masks
7. CSP, autocomplete=off, print-media masking, no-cache response headers

---

## 4. Architecture

### 4.1 Logical diagram

```
[MCP clients]   [Admin browsers]
     │                 │
     │ MCP/HTTPS       │ HTTPS
     │                 ▼
     │       CloudFront + WAF ── S3 (Admin SPA, OAC)
     │                 │ /api/*
     │                 ▼
     │           API Gateway + WAF
     │                 │  (Cognito JWT authorizer)
     │                 ▼
     │           Admin Lambda (in VPC)
     │                 │
     │   ┌─────────────┼────────────────────────┐
     │   ▼             ▼                        ▼
     │ DDB ConfigTable / QuotaTable / AuditLogTable
     │   │             │                        │
     │   │             │             S3 audit (Object Lock)
     │   │             ▼
     │   │   AgentCore Gateway control-plane
     │   ▼
     │ AgentCore Gateway (data-plane / MCP endpoint)
     │   ├── Built-in: Tavily ──→ Tavily API
     │   ├── Built-in: Brave  ──→ Brave API
     │   └── Lambda target: search-router
     ▼
search-router Lambda (in VPC)
  ├─ QuotaService (DDB)
  ├─ Adapters: exa / searxng / arxiv / pubmed / semanticscholar
  ├─ search_unified: parallel fan-out → URL-canonical dedupe → RRF
  ├─ Secrets via Secrets-Manager VPC endpoint (KMS-CMK)
  └─ Metrics via CloudWatch EMF

Adapters call:
  - Exa / arXiv / PubMed / Semantic Scholar  → HTTPS via NAT
  - SearXNG  → internal ALB → ECS Fargate task (private subnet)
```

### 4.2 Components

#### AgentCore Gateway (managed)
- MCP endpoint, tool definitions, auth gateway, routing.
- No business logic in the Gateway — quotas, dedupe, ranking are in Lambda.

#### search-router Lambda (Node.js 20, ARM64, VPC, 12 s timeout)
- Hosts all custom Lambda providers behind a single Gateway Lambda target.
- Modules:
  - `QuotaService` — DDB conditional increment (RPM + daily windows)
  - `adapters/<provider>.ts` — per-provider Adapter implementations
  - `unified.ts` — fan-out, dedupe, RRF rank
  - `metrics.ts` — EMF helper
  - `secrets.ts` — Secrets Manager + 5-min in-memory cache
  - `circuit-breaker.ts` — per-provider, per-instance
- All adapters return the same `SearchResult` shape:
  `{ url, title, snippet, publishedAt?, source, score?, raw? }`
- Per-provider call timeout 8 s; Lambda cap 12 s.

#### Admin Lambda (Node.js 20, ARM64, VPC, 15 s timeout)
- BFF for the Admin UI; routes:
  - `GET /providers`, `PUT /providers/:id`
  - `POST /providers/:id/secret`, `POST /providers/:id/secret/reveal`,
    `POST /providers/:id/test`
  - `GET /metrics?provider=&window=`, `GET /audit?from=&to=`
- IAM: write to Secrets Manager only under `search-agentcore-gateway/*`.
- Synchronous transactional flow: ConfigTable → Gateway control-plane →
  AuditLog (with rollback at each step).

#### Reconciler Lambda (15-min schedule)
- Diffs ConfigTable vs Gateway state, corrects drift, emits alarm.

#### DynamoDB
- **ConfigTable** — `PK = tenantId#default`, `SK = provider#<id>`. Fields:
  enabled, secretArn?, quota{rpm,daily}, unitCostUSD, category, lastModifiedAt,
  lastModifiedBy. PITR on. KMS CMK.
- **QuotaTable** — `PK = provider#<id>`, `SK = window#<rpm|daily>#<bucket>`,
  `count`, `ttl`. TTL auto-purge.
- **AuditLogTable** — `PK = date#YYYY-MM-DD`, `SK = ts#<ulid>`. Fields: actor
  (sub, email), action, resource, reason?, ip, userAgent, before, after.
  Daily export to S3 Object Lock (governance mode, 7 yr retention default).

#### Cognito User Pool
- Email + password + MFA. Groups `Admins` / `Viewers` map to API GW IAM scope.
- Advanced security on. Step-up MFA enforced for reveal endpoint.

#### CloudFront + S3 (Admin SPA)
- React (Vite + TS) + Amplify UI Authenticator.
- S3 bucket private; OAC; CloudFront viewer protocol HTTPS-only, TLS 1.2 min;
  managed security headers + custom CSP/HSTS; CloudFront-scoped WAF.

#### SearXNG (Fargate)
- Public image `searxng/searxng` (or customer-mirrored ECR), 1 task in
  private subnet.
- Internal ALB only; only the search-router SG may reach it.
- Read-only root filesystem, non-privileged, awslogs to KMS-encrypted log
  group.
- Default state: **disabled**. Admin must explicitly enable. Documentation
  warns that customers are responsible for upstream-engine ToS compliance.

#### Networking & shared security
- VPC: 2 private subnets (multi-AZ), 1 NAT GW, **no public subnets** for
  Lambdas/ECS. Optional reuse of an existing VPC via stack props
  (`existingVpcId`, `subnetIds`, `securityGroupIds`).
- VPC interface endpoints: `secretsmanager`, `kms`, `logs`, `monitoring`,
  `events`, `sts`, `bedrock-agentcore`, `bedrock-agentcore-control`. Gateway
  endpoints: `dynamodb`, `s3`. All endpoints have resource policies pinning
  to this account/VPC.
- Security groups: deny-by-default; named SGs with descriptions; default SG
  unused. Provider Lambda SG egress 443 → NAT and VPC endpoints. Admin Lambda
  SG egress to VPC endpoints only (no NAT).
- NACLs: ephemeral port range only.
- KMS CMKs (4): `secrets`, `ddb`, `s3`, `logs`. Auto-rotation on.
- WAF v2: AWS managed common/known-bad-inputs/IP-reputation/anonymous-IP/SQLi;
  rate-based rule; optional `customAllowedCidrs` allowlist.
- API Gateway: regional endpoint, request validator, per-method throttling,
  optional mTLS.
- CloudTrail: management + data events on Secrets Manager, ConfigTable,
  AuditLogTable, audit S3 bucket. Multi-region.
- AWS Config baseline rule pack applied; GuardDuty + Security Hub optional
  via stack prop.
- cdk-nag (AwsSolutions + HIPAA) gates `cdk synth`.

#### Observability layer
- CloudWatch dashboard (CDK-synthesised) with per-provider rows (invocations,
  errors, p50/p95 latency, estimated cost, quota usage), an aggregate widget,
  a quota-status bar chart, and an error breakdown.
- One SNS topic; customers add their own subscriptions.
- Resource tagging (`project`, `provider`, `environment`,
  `data-classification`) so Cost Explorer can break out per-provider AWS
  infrastructure cost separately from the *estimated* per-provider API cost.

### 4.3 Component responsibility boundaries

| Concern | Owner |
|---|---|
| MCP protocol | AgentCore Gateway |
| Tool definitions, routing | AgentCore Gateway |
| Provider call, normalize, dedupe, rank | search-router Lambda |
| Quota enforcement | search-router (Lambda hard) / alarms only (built-in) |
| Configuration source of truth | DDB ConfigTable |
| Config → Gateway propagation | Admin Lambda (sync) + Reconciler (drift) |
| AuthN / AuthZ | Cognito + API GW authorizer + IAM |
| Secrets at rest | Secrets Manager (KMS-CMK) |
| Observability | CloudWatch (metrics, logs, dashboards, alarms) |
| Audit | DDB AuditLogTable + S3 Object Lock + CloudTrail |

---

## 5. Key data flows

### 5.1 Single-provider call (`search_arxiv` example)

1. MCP client → Gateway with OAuth token.
2. Gateway validates, resolves Lambda target, invokes search-router.
3. search-router parses args (Zod), calls QuotaService (DDB conditional
   increment); if over → throw `RATE_LIMITED`.
4. Loads secret from cache or Secrets Manager via VPC endpoint.
5. `adapters.arxiv.search(query)` over HTTPS via NAT.
6. Normalize → `SearchResult[]`.
7. Emit EMF metric (Provider, Operation, Status / Invocations, Errors,
   LatencyMs, ResultBytes, EstimatedCostUSD, QuotaUsage).
8. Return JSON via Gateway.

Error mapping is in §6.1.

### 5.2 `search_unified`

- Args: `{ query, categories?: ["web","academic"], topK = 10 }`.
- Resolve enabled Lambda providers in scope (ConfigTable cached 30 s).
- `Promise.allSettled([...adapter.search(q)])` — each call still goes through
  its own QuotaService.
- Canonicalise URLs (lowercase host, strip `utm_*` / `fbclid`, trailing
  slash) and dedupe.
- Reciprocal Rank Fusion: `score = Σ 1 / (k + rank_i)`, k = 60.
- Slice top-K; respond with results + `providersUsed`, `providersFailed`,
  `latencyMsByProvider`.
- Tavily/Brave are **not** part of v1 fan-out (they live outside our code
  path).

### 5.3 Admin save (PUT `/providers/:id`)

1. WAF + Cognito JWT authorizer + Admin role check.
2. Admin Lambda: validate body; check role.
3. Secrets Manager `PutSecretValue` (new version) if key supplied.
4. Provider ping using the same adapter the runtime uses.
   - On failure: discard the new secret version (`AWSPENDING` stage) and
     return 400 InvalidKey.
5. ConfigTable `Put` (new state).
6. AgentCore Gateway control-plane update (target/tool registration).
   - On failure after retry: rollback ConfigTable, return 502.
7. AuditLog `Put` (before, after, actor, reason?).
8. CloudWatch `ConfigChange` metric.

Idempotency keys are required on mutating endpoints.

### 5.4 Secret reveal

1. Admin role check.
2. Verify the request carries a valid `mfa_assertion` from the
   `/auth/step-up` flow (issued ≤ 5 min ago, single-use); otherwise return 401
   with `step_up_required`.
3. Hourly per-session reveal counter; > 5 → 429 + alarm.
4. `GetSecretValue` (KMS decrypt via VPC endpoint).
5. AuditLog Put + SNS publish to `security-events` topic.
6. One-shot 30 s response (no cache headers).
7. UI: masked by default; explicit "Show" reveals for 30 s; clipboard copy
   on user click; print-media masking.

### 5.5 Dashboard data fetch

- Admin Lambda → CloudWatch `GetMetricData` batch (≤ 500 queries).
- Builds per-provider × per-metric series; for built-in providers, uses
  Gateway-native metrics + math expressions for cost estimates.
- Browser caches client-side 30 s; auto-refresh 60 s.

---

## 6. Error handling & resilience

### 6.1 Standard error codes (returned via MCP)

| Code | Meaning | Client action | Metric `Status` |
|---|---|---|---|
| `INVALID_ARGUMENT` | Schema violation | Fix call | `BadRequest` |
| `RATE_LIMITED` | Our hard quota tripped | Retry after `retryAfterSec` | `Throttled` |
| `UPSTREAM_RATE_LIMITED` | Provider returned 429 | Backoff + retry | `UpstreamThrottled` |
| `UPSTREAM_AUTH` | Provider key invalid/expired | Do not retry; alert admin | `AuthFailed` |
| `UPSTREAM_ERROR` | Provider 5xx | Try other provider | `Error` |
| `UPSTREAM_TIMEOUT` | Provider > 8 s | Try other provider | `Timeout` |
| `INTERNAL` | Bug | Report | `Internal` |

All errors carry `traceId`, `provider`, `requestId` in metadata.

### 6.2 Retry, circuit breaker, bulkhead
- Retry: 5xx + timeout only; 3 attempts; 100/200/400 ms with jitter; 4xx
  never retried.
- Circuit breaker per provider per Lambda instance: 1-min window, ≥ 50 %
  failures with ≥ 20 calls → open 30 s, half-open 1 probe, then close.
- Bulkhead: per-provider in-flight cap inside `search_unified` — slow
  provider does not starve others.
- Graceful degradation:
  - Secrets Manager blip → 5-min cache covers it; cache miss → `INTERNAL`.
  - QuotaTable unavailable → fail-closed by default; opt-in `failOpenQuota`
    stack prop for customers who explicitly accept the risk.

### 6.3 Sync-failure matrix (admin save)

| Step that failed | State after failure | Recovery |
|---|---|---|
| Secrets Manager Put | unchanged | 4xx/5xx; user retries |
| Provider ping | new secret version exists | Discard `AWSPENDING`; 400 InvalidKey |
| ConfigTable Put | secret active, config stale | 5xx + reconciler corrects within 15 min |
| Gateway control-plane | secret + config applied, gateway stale | Auto-retry 3×; on persistent failure rollback config + 502 |
| AuditLog Put | everything else applied, audit missing | 502 (audit-first) |

### 6.4 Default alarms (SNS topic)

- ProviderErrorRateHigh (5-min err rate > 5 %)
- ProviderQuotaApproaching (daily ≥ 80 % of cap)
- ProviderQuotaExceeded (daily ≥ cap; Lambda providers it's blocked, built-in
  it's just observed)
- ProviderUpstreamDown (5-min 5xx > 50 %)
- ConfigDriftDetected (reconciler)
- SecretRotationOverdue (> 90 d)
- RevealRateUnusual (> 5/hour)
- AdminAuthFailures (> 10/5-min)
- EstimatedCostBudget (daily aggregate over threshold)
- LambdaThrottle / Errors
- WAFBlockedSpike
- GatewayAvailability (5xx > 1 %)

### 6.5 Retention defaults

| Data | Where | Retention |
|---|---|---|
| Lambda logs | CloudWatch Logs | 30 d (override) |
| EMF metrics | CloudWatch Metrics | 15 mo (AWS default) |
| AuditLog | DDB (PITR) | 1 yr (override) |
| AuditLog archive | S3 Object Lock | 7 yr governance |
| WAF logs | S3 | 90 d |
| CloudTrail | S3 | 1 yr |
| Secrets old versions | Secrets Manager | 7 d grace |

### 6.6 Known limitations (must be documented to customers)
- Built-in providers' quotas are soft only; real enforcement depends on the
  upstream provider's own controls.
- `search_unified` does not include built-ins in v1.
- Single region; failover to a second region is v2.
- Estimated cost is unitCost × invocations and is not guaranteed to match
  the provider invoice.
- Secret reveal still leaves residual screenshot risk; the controls reduce
  but do not eliminate it.

---

## 7. Test strategy & code structure

### 7.1 Repo layout

```
search-agentcore-gateway/
├─ docs/
│  ├─ superpowers/specs/2026-05-23-search-agentcore-gateway-design.md
│  ├─ adapter-authoring.md
│  ├─ deployment.md
│  ├─ operations.md
│  └─ security.md
├─ packages/
│  ├─ shared/         # types, logger, metrics, errors, secrets, telemetry
│  ├─ adapters/       # exa, searxng, arxiv, pubmed, semanticscholar
│  ├─ search-router/  # provider Lambda; quota, unified, RRF, breaker
│  ├─ admin-api/      # admin BFF Lambda; routes, services, RBAC
│  ├─ reconciler/     # 15-min drift correction Lambda
│  └─ admin-ui/       # React/Vite/TS, Amplify UI auth
├─ infra/             # CDK app
│  └─ lib/
│     ├─ stack.ts
│     ├─ network/    (vpc, endpoints, waf)
│     ├─ data/       (config, quota, audit tables)
│     ├─ compute/    (search-router, admin, reconciler functions)
│     ├─ gateway/    (agentcore-gateway, targets)
│     ├─ frontend/   (admin-ui-bucket, cloudfront, cognito)
│     ├─ searxng/    (fargate-service, private-alb, task-definition)
│     ├─ observability/ (dashboard, alarms)
│     └─ security/   (kms, iam helpers)
├─ examples/         # newsapi-adapter, confluence-adapter, rotation-template
└─ search-providers.example.yaml
```

### 7.2 Test pyramid

| Level | Tools | Coverage focus | Target share |
|---|---|---|---|
| Unit | Vitest | adapter query building / response normalize, RRF, canonicalize, quota math, RBAC decisions | 70 % |
| Component | Vitest + `aws-sdk-client-mock` | Lambda handler I/O; Secrets/DDB/Gateway interactions | 20 % |
| Integration | LocalStack + `nock`-fake providers | search-router & admin-api end-to-end (no real provider calls) | 7 % |
| E2E (post-deploy) | Playwright + smoke MCP client | Login → enable provider → search → dashboard reflect | 3 % |

### 7.3 Adapter contract test
A shared `contract.test.ts` runs against every adapter:
- Correct `name`, `category`.
- Empty query → `INVALID_ARGUMENT`.
- Normal query → `SearchResult[]` (Zod-validated).
- Auth failure → `UPSTREAM_AUTH`.
- Timeout → `UPSTREAM_TIMEOUT`.
HTTP responses are pinned with `nock`; fixtures live under
`__fixtures__/<provider>/`. Adding a new provider requires passing this
suite as a merge gate.

### 7.4 Security & compliance tests
- cdk-nag (AwsSolutions + HIPAA) blocks `cdk synth` on any violation.
- IAM least-priv regression via snapshot tests of role policies.
- Secrets-leak static scan (gitleaks pre-commit + CI).
- Dependency vulnerabilities: `pnpm audit --prod` + Dependabot.
- STRIDE threat model documented in `docs/security.md`, including the
  residual risks from §6.6.

### 7.5 CI/CD gates (GitHub Actions)
1. `pnpm install --frozen-lockfile`
2. lint + typecheck
3. unit + component tests
4. integration tests (LocalStack)
5. build (Lambda esbuild bundles, UI vite build)
6. `cdk synth` + cdk-nag
7. PR: `cdk diff` comment; main: `cdk deploy` to staging + Playwright;
   release tag: production with manual approval.

### 7.6 Local dev
- `pnpm dev:ui` (Vite, mocked backend)
- `pnpm dev:lambda search-router` (esbuild watch + AWS Lambda RIE)
- `pnpm test:adapter exa --record` (refresh fixtures)
- `cdk synth --context env=dev`

### 7.7 SLOs (v1 targets)
- Lambda provider call p95: provider p95 + 200 ms.
- `search_unified` p95: slowest enabled provider p95 + 300 ms.
- Admin API p95 (excluding reveal): ≤ 800 ms.
- Lambda + DDB availability: 99.9 %.
- Error budget: 4xx/5xx (excluding upstream provider errors) < 0.5 %/month.
- Cold-start budget: search-router ARM64 200–400 ms; provisioned concurrency
  0–2 customer-configurable.

---

## 8. Roadmap (post-v1)

- **v1.5:** include built-ins in `search_unified`; `answer_with_search`
  synthesis tool; Confluence default adapter.
- **v2:** SAML/OIDC federation; multi-tenancy; multi-region failover; news
  & code default adapters; real automatic rotation for providers that
  support it.

---

## 9. Open questions / explicit deferrals

- Optional PrivateLink-only exposure of the Gateway (private MCP) — listed
  for v1.5 if customers ask.
- Whether to add `EnableGuardDuty` / `EnableSecurityHub` as default-on
  rather than opt-in — left default-off in v1 because customers commonly
  manage these centrally.
- Customer-supplied KMS keys — supported via stack props but not enforced
  default; default is to create new CMKs in the stack.

---

## 10. Acceptance criteria (used to size the implementation plan)

A v1 release is complete when:
1. `cdk deploy` succeeds into a clean account, including SearXNG Fargate.
2. An MCP client (Claude Desktop or a smoke test client) can list and call
   `search_tavily`, `search_brave`, `search_exa`, `search_searxng`,
   `search_arxiv`, `search_pubmed`, `search_semanticscholar`, and
   `search_unified`.
3. Admin can log in, enable a provider, save a key, see "test connection"
   pass, watch the metric appear in the dashboard, and see the audit log
   record.
4. Admin can reveal a secret with step-up MFA + reason, and the reveal is
   in audit + S3 archive.
5. Hard-quota providers actually return `RATE_LIMITED` once over cap.
6. Soft-quota built-ins fire `ProviderQuotaApproaching` /
   `ProviderQuotaExceeded` alarms once thresholds breached.
7. cdk-nag passes; no new IAM-policy-snapshot regressions.
8. Reconciler corrects an artificially-induced drift within 15 minutes.
