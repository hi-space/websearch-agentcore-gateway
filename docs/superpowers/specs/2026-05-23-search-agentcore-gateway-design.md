# Search AgentCore Gateway — Design

- Status: Updated 2026-05-23 — reflects v1.0 implementation decisions and the
  shift from React-SPA + API-Gateway to Next.js-on-Lambda + CloudFront-WAF.
  Roadmap re-organised around subsystems (see §8, §11) rather than version
  labels.
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
- `answer_with_search` (LLM-synthesised answer over fan-out results) — v2.
- Confluence default adapter — sample only in v1; default in v2.
- mTLS or external-API-key auth surfaces (the admin console is human-only;
  if non-human REST consumers appear, API Gateway is reintroduced as a
  separate origin in v2 — see §2.3).

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
- MCP endpoint via AgentCore Gateway (the data-plane consumed by clients).
- Admin Console — Next.js (App Router) on a single Lambda Function URL,
  fronted by CloudFront + WAF. Cognito JWT is verified in Next.js middleware;
  the same app serves both the SSR pages and `/api/*` route handlers (the
  BFF). No API Gateway in v1.
- CloudWatch dashboards & SNS alarms (machine-facing observability layer).
- Audit log surface (DDB + S3 Object Lock).

### 2.3 Out of scope for v1 — listed explicitly
- Multi-tenancy, SaaS, marketplace listing.
- Built-in code/news adapters (samples only).
- Built-in internal-search adapters (Confluence sample only).
- `answer_with_search` / synthesis tools (v2).
- Automatic provider key rotation that actually mints keys (provider APIs
  generally don't support it).
- API Gateway as the admin origin. Reintroduced only if v2 surfaces a
  non-human REST API that needs mTLS, usage plans, or per-method throttling.
- Including Tavily/Brave inside `search_unified` is **in scope** for v1
  via the two-stage fan-out pattern (§5.2); the older deferral note has
  been removed.

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
- **Roles:** `Admins` and `Viewers` (Cognito groups → ID-token claim →
  Next.js middleware decision → role-scoped IAM credentials when calling
  AWS APIs).
- JWT verification: `aws-jwt-verify` in Next.js middleware on every
  `/api/*` route. Public assets bypass the middleware.
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
     │           CloudFront + WAF
     │                 │ (all paths)
     │                 ▼
     │       Admin Console — Next.js (App Router)
     │       on Lambda Function URL (in VPC)
     │         ├─ middleware: Cognito JWT verify (aws-jwt-verify)
     │         ├─ pages   : SSR/CSR Admin UI
     │         └─ /api/*  : route handlers (BFF)
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
  ├─ search_unified: two-stage fan-out (built-ins via MCP re-invoke
  │                  + own Lambda adapters) → URL-canonical dedupe → RRF
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

#### Admin Console — Next.js on Lambda (Node.js 20, ARM64, VPC, 15 s timeout)
- Single Next.js (App Router) app deployed as one Lambda Function URL.
- Hosts both the SSR/CSR pages (Admin UI) and `/api/*` route handlers
  (the BFF).
- Cognito JWT verification runs in `middleware.ts` for every `/api/*`
  request; `aws-jwt-verify` checks signature + audience + Cognito group
  claim, then attaches the role to the request context.
- BFF routes (Next.js route handlers):
  - `GET /api/providers`, `PUT /api/providers/:id`
  - `POST /api/providers/:id/secret`,
    `POST /api/providers/:id/secret/reveal`,
    `POST /api/providers/:id/test`
  - `GET /api/metrics?provider=&window=`, `GET /api/audit?from=&to=`
- IAM: writes to Secrets Manager only under `search-agentcore-gateway/*`.
- Synchronous transactional flow: ConfigTable → Gateway control-plane →
  AuditLog (with rollback at each step).
- Per-method throttling that API Gateway used to provide is replaced by
  (a) a CloudFront rate-based WAF rule and (b) per-route Zod validation
  + small in-process token-bucket on mutating routes.

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
- Email + password + MFA. Groups `Admins` / `Viewers` are read from the
  ID-token claim by Next.js middleware; the middleware decides whether the
  request reaches the route handler at all (Viewers cannot reach mutating
  routes).
- Advanced security on. Step-up MFA enforced for reveal endpoint.

#### CloudFront (admin entry point)
- Single distribution; only origin is the Admin Console Lambda Function URL.
- Viewer protocol HTTPS-only, TLS 1.2 min; AWS-managed security-headers
  policy + custom CSP/HSTS.
- WAF v2 attached at the CloudFront scope (managed common /
  known-bad-inputs / IP-reputation / anonymous-IP / SQLi rule sets, plus a
  rate-based rule on `/api/*`).
- No S3 origin and no API Gateway origin in v1 — the Next.js app serves
  static assets, SSR, and `/api/*` from one Lambda. Static assets are
  cached at the CloudFront edge with the standard Next.js immutable
  fingerprinted-asset policy.

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
- VPC interface endpoints (v1.0 baseline, codified in
  `infra/lib/network/vpc.ts`): `secretsmanager`, `kms`, `logs`,
  `monitoring`, `events`, `sts`. Gateway endpoints: `dynamodb`, `s3`.
  `bedrock-agentcore` / `bedrock-agentcore-control` interface endpoints
  are added once their service names are GA in the target region; until
  then the Gateway control-plane is reached over NAT and the data-plane
  is reached by AgentCore itself (outside the VPC). All endpoints have
  resource policies pinning to this account/VPC.
- Security groups: deny-by-default; named SGs with descriptions; default SG
  unused. Provider Lambda SG egress 443 → NAT and VPC endpoints. Admin
  Console Lambda SG egress to VPC endpoints only (no NAT).
- NACLs: ephemeral port range only.
- KMS CMKs (4): `secrets`, `ddb`, `s3`/`logs` shared, plus a dedicated
  `logs` key — see `infra/lib/security/kms.ts`. All have auto-rotation on
  and `RemovalPolicy.RETAIN`.
- WAF v2 (CloudFront-scoped): AWS managed common /
  known-bad-inputs / IP-reputation / anonymous-IP / SQLi; rate-based rule
  on `/api/*`; optional `customAllowedCidrs` allowlist.
- CloudTrail: management + data events on Secrets Manager, ConfigTable,
  AuditLogTable, audit S3 bucket. Multi-region.
- AWS Config baseline rule pack applied; GuardDuty + Security Hub optional
  via stack prop (default off — see security-hardening subsystem in §11).
- cdk-nag (AwsSolutions + HIPAA) gates `cdk synth`. v1.0 carries explicit
  suppressions documented in `infra/lib/nag-suppressions.ts`; the
  security-hardening subsystem closes them.

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
| Config → Gateway propagation | Admin Console BFF (sync) + Reconciler (drift) |
| AuthN / AuthZ | Cognito + Next.js middleware + IAM |
| Edge protection (rate limit, WAF rules) | CloudFront + WAF v2 |
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
- Resolve enabled providers in scope (ConfigTable cached 30 s) — both
  Lambda adapters and Gateway built-ins.
- Two-stage fan-out:
  1. **Lambda adapters** — `Promise.allSettled([...adapter.search(q)])`,
     each going through its own QuotaService.
  2. **Gateway built-ins (Tavily/Brave)** — search-router opens an MCP
     session back to its own Gateway and re-invokes `search_tavily` /
     `search_brave` as native tools. This stays inside the AgentCore data
     plane (built-in quotas, retries, auth) while letting us merge the
     results.
- Canonicalise URLs (lowercase host, strip `utm_*` / `fbclid`, trailing
  slash) and dedupe.
- Reciprocal Rank Fusion: `score = Σ 1 / (k + rank_i)`, k = 60.
- Slice top-K; respond with results + `providersUsed`, `providersFailed`,
  `latencyMsByProvider`.
- A built-in stage failure is recorded in `providersFailed` but does not
  fail the whole call; the Lambda-adapter stage is treated symmetrically.

### 5.3 Admin save (PUT `/api/providers/:id`)

1. CloudFront + WAF (rate-based + managed rule sets).
2. Next.js middleware: verify Cognito JWT, extract group claim, enforce
   `Admins` for mutating routes.
3. Route handler: Zod-validate body; idempotency key check.
4. Secrets Manager `PutSecretValue` (new version) if key supplied.
5. Provider ping using the same adapter the runtime uses.
   - On failure: discard the new secret version (`AWSPENDING` stage) and
     return 400 InvalidKey.
6. ConfigTable `Put` (new state).
7. AgentCore Gateway control-plane update (target/tool registration).
   - On failure after retry: rollback ConfigTable, return 502.
8. AuditLog `Put` (before, after, actor, reason?).
9. CloudWatch `ConfigChange` metric.

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

- Admin Console BFF route (`GET /api/metrics`) → CloudWatch
  `GetMetricData` batch (≤ 500 queries).
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
- `search_unified` includes built-ins via two-stage fan-out (§5.2). Because
  the built-in stage is an extra MCP hop, its tail latency adds to the
  unified-call p95 budget — the SLO in §7.7 already accounts for this.
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
│  ├─ superpowers/plans/                # one file per subsystem (§11)
│  ├─ adapter-authoring.md
│  ├─ deployment.md
│  ├─ operations.md
│  └─ security.md                       # STRIDE doc lands in security-hardening
├─ DESIGN.md                            # UI design system (admin-console)
├─ packages/
│  ├─ shared/         # types, logger, metrics, errors, secrets, telemetry
│  ├─ adapters/       # exa, searxng, arxiv, pubmed, semanticscholar
│  ├─ search-router/  # provider Lambda; quota, unified (two-stage), RRF, breaker
│  ├─ admin-console/  # Next.js (App Router): pages + /api/* route handlers
│  └─ reconciler/     # 15-min drift correction Lambda
├─ infra/             # CDK app
│  └─ lib/
│     ├─ stack.ts
│     ├─ network/    (vpc, endpoints, waf)
│     ├─ data/       (config, quota, audit tables)
│     ├─ compute/    (search-router, admin-console, reconciler functions)
│     ├─ gateway/    (agentcore-gateway, targets)
│     ├─ frontend/   (cloudfront-distribution, cognito-user-pool)
│     ├─ searxng/    (fargate-service, private-alb, task-definition)
│     ├─ observability/ (dashboard, alarms)
│     └─ security/   (kms, iam helpers, nag-suppressions)
├─ examples/         # newsapi-adapter, confluence-adapter, rotation-template
└─ search-providers.example.yaml
```

The Admin Console is one Next.js app, not two packages. The single
deployable target is a Lambda (Function URL) behind CloudFront — no
separate S3 bucket and no API Gateway. The previous `admin-spa` /
`admin-api` split has been merged.

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
- `pnpm --filter admin-console dev` (Next.js dev server with mocked AWS
  clients via `aws-sdk-client-mock`)
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

## 8. Roadmap (subsystems, not version labels)

v1.0 (the walking skeleton — `arxiv` only, single MCP tool, hard quota,
KMS, EMF, one alarm) is in place. Subsequent work is sliced by **subsystem**.
Each subsystem is its own implementation plan and ends in working software
that can be exercised independently. Order, dependencies, and "done" criteria
are defined in §11.

| Subsystem | Headline outcome |
|---|---|
| `multi-provider-search` | 6 more MCP tools (5 providers + `search_unified`). |
| `admin-bff` | Cognito + Next.js route handlers; provider CRUD, secret PUT/test/reveal; curl-driven acceptance. |
| `admin-ui` | Next.js pages over the BFF, applying the design system in `/DESIGN.md`. |
| `searxng-adapter` | Self-hosted Fargate metasearch, default-disabled. |
| `operability-and-audit` | Full dashboard, full alarm set, Reconciler, AuditLogTable S3-Object-Lock export, CloudTrail data events. |
| `security-hardening` | All cdk-nag suppressions removed; STRIDE doc; IAM least-priv; GuardDuty / Security Hub stack props. |

**Post-v1 (v2 candidates).** SAML/OIDC federation; multi-tenancy;
multi-region failover; `answer_with_search` synthesis tool; Confluence as
default adapter; news/code default adapters; provider-API auto-rotation
where supported; reintroducing API Gateway as a separate origin if a
non-human REST consumer surface needs mTLS or usage plans.

---

## 9. Open questions / explicit deferrals

- Optional PrivateLink-only exposure of the Gateway (private MCP) — defer
  to v2 unless a customer asks during the operability subsystem rollout.
- Whether to add `EnableGuardDuty` / `EnableSecurityHub` as default-on
  rather than opt-in — left default-off in v1 because customers commonly
  manage these centrally; revisit during the security-hardening subsystem.
- Customer-supplied KMS keys — supported via stack props but not the
  default; default remains "create new CMKs in the stack".
- AgentCore Gateway control-plane API shape (`createGateway`,
  `createTarget`) is recorded in v1.0 against the SDK at implementation
  time. If AWS ships an L1 CFN type before the next subsystem starts, the
  multi-provider-search plan switches to it; the design intent is
  preserved either way.

---

## 10. Acceptance criteria (per subsystem)

Acceptance is defined per subsystem rather than as a single "v1 ships"
gate. The aggregate "everything green" gate lives in
`security-hardening` (§11), which is the last subsystem.

**v1.0 walking skeleton (already in tree)**
1. `cdk deploy` succeeds into a clean account, single arxiv tool exposed.
2. An MCP client can list and call `search_arxiv`.
3. Hard quota returns `RATE_LIMITED` once over cap.
4. The arXiv-upstream-error alarm transitions to ALARM under induced load.
5. cdk-nag passes (with the suppressions in `nag-suppressions.ts`).

Each later subsystem inherits all v1.0 criteria and adds its own —
listed in §11.

---

## 11. Subsystem map

The roadmap in §8 enumerates the subsystems; this section is the
authoritative reference for **what each subsystem owns, what it depends
on, and how we decide it is done**. Plans live under
`docs/superpowers/plans/` named `2026-05-23-<subsystem>.md`.

### 11.1 Dependency order

```
v1.0 walking skeleton (done)
        │
        ▼
multi-provider-search ────────────────┐
        │                              │
        ▼                              │
admin-bff                              │
        │                              │
        ├──► admin-ui                  │
        ├──► searxng-adapter ──────────┤
        └──► operability-and-audit ────┤
                                       │
                                       ▼
                             security-hardening
                             (final aggregate gate)
```

`admin-ui`, `searxng-adapter`, and `operability-and-audit` may run in
parallel after `admin-bff` lands. `security-hardening` is the last
subsystem because it removes cdk-nag suppressions that earlier work
relies on.

### 11.2 Per-subsystem responsibilities, interfaces, and done criteria

#### 11.2.1 `multi-provider-search`
- **Owns:** Lambda adapters for `exa`, `perplexity`, `you`, plus the
  `search_unified` orchestrator with its two-stage fan-out (Lambda
  adapters in parallel; Gateway built-ins via MCP re-invoke for Tavily
  and Brave). Also: provider registry, RRF (`k=60`) merge, schema
  validation, structured upstream error mapping.
- **Depends on:** v1.0 walking skeleton (search-router runtime, Gateway,
  ConfigTable shape, EMF logger, KMS, quota table).
- **Interfaces produced:**
  - MCP tools: `search_exa`, `search_perplexity`, `search_you`,
    `search_unified`. Tavily/Brave remain Gateway built-ins.
  - Internal: provider adapter contract under
    `packages/adapters/src/<provider>/`.
- **Done when:**
  1. All five additional MCP tools list and call successfully against a
     deployed dev stack.
  2. `search_unified` returns merged results from at least one Lambda
     adapter and one Gateway built-in in a single call.
  3. Per-adapter contract tests pass with recorded fixtures.
  4. RRF merge test covers tie-breaks and missing rankings.
  5. EMF metrics emit a `provider` dimension for every call.

#### 11.2.2 `admin-bff`
- **Owns:** The Next.js (App Router) BFF on a single Lambda Function
  URL: Cognito JWT verification middleware (`aws-jwt-verify`),
  role-scoped IAM credential vending, route handlers for `GET/PUT
  /api/providers/:id`, `POST /api/providers/:id/test`,
  `POST /api/providers/:id/secret`, `POST /api/providers/:id/secret/reveal`,
  `GET /api/metrics`, plus Zod request validation and structured audit
  logging into AuditLogTable.
- **Depends on:** `multi-provider-search` (provider registry shape;
  routes manage provider configs and secrets).
- **Interfaces produced:**
  - HTTP API surface listed above, behind CloudFront + WAF.
  - Audit log schema in AuditLogTable (actor, action, target, before,
    after, ts).
- **Done when:**
  1. A reviewer can drive the full admin flow end-to-end with curl /
     Postman using a Cognito JWT — list providers, edit one, store and
     reveal a secret, run `test`, fetch `metrics`.
  2. Reveal action lands in AuditLogTable.
  3. Failed JWT, wrong role, and Zod-invalid payloads each return the
     correct status with no PII leakage.

#### 11.2.3 `admin-ui`
- **Owns:** Next.js pages on the same Lambda as `admin-bff`. Provider
  list + edit, secret PUT / test / reveal, dashboard, audit log viewer.
  Visual styling follows `/DESIGN.md` (the UI design system) and not the
  spec file.
- **Depends on:** `admin-bff` (calls `/api/*` only — no direct AWS SDK
  use from pages).
- **Interfaces produced:** `/admin/*` pages served by the Next.js
  Lambda; no new HTTP API surface.
- **Done when:**
  1. The flows that `admin-bff` validates over curl are reachable from
     a logged-in browser session.
  2. Pages render against the `/DESIGN.md` tokens (color, typography,
     spacing) and pass an a11y baseline (Lighthouse a11y ≥ 90).
  3. Reveal flow shows the secret only after a confirm step and clears
     it from the DOM on navigation.

#### 11.2.4 `searxng-adapter`
- **Owns:** Self-hosted SearXNG on Fargate (private subnet), an internal
  ALB target, and a `searxng` Lambda adapter that calls it. Default
  **disabled** in ConfigTable; opt-in per stack prop.
- **Depends on:** `multi-provider-search` (adapter contract,
  `search_unified` registration). Independent of admin-ui.
- **Interfaces produced:**
  - MCP tool: `search_searxng` (when enabled).
  - Infra: SearXNG Fargate service + ALB + adapter wiring.
- **Done when:**
  1. Stack prop `enableSearxng: true` deploys SearXNG and registers the
     adapter; default deploy is unchanged.
  2. `search_searxng` returns results in a deployed env.
  3. `search_unified` includes searxng results when enabled.

#### 11.2.5 `operability-and-audit`
- **Owns:** Full CloudWatch dashboard (per-provider widgets,
  `search_unified` panel, admin panel), full alarm set (per-provider
  error rate, p95 latency, quota saturation, reveal-rate spike), the
  Reconciler Lambda (Gateway target drift vs ConfigTable), CloudTrail
  data events on Secrets / KMS / DynamoDB, AuditLogTable S3 export with
  Object Lock for retention.
- **Depends on:** `admin-bff` (admin metrics, audit log shape) and
  `multi-provider-search` (per-provider metrics). Independent of
  `admin-ui`.
- **Interfaces produced:**
  - CloudWatch dashboard JSON.
  - SNS alarm topic with the documented action set.
  - S3 bucket with Object Lock for audit exports.
- **Done when:**
  1. Dashboard widgets populate from real EMF metrics in a dev stack.
  2. Each alarm has been forced to ALARM at least once (synthetic
     fault) and rolled back to OK.
  3. Reconciler diff log entry appears when ConfigTable and the Gateway
     are deliberately desynced.
  4. AuditLogTable export to S3 is visible and immutable.

#### 11.2.6 `security-hardening`
- **Owns:** Removal of every cdk-nag suppression from `nag-suppressions.ts`
  with code changes (not just suppression edits) wherever feasible; IAM
  least-privilege pass on all roles; STRIDE threat model document under
  `docs/security/`; stack props for `EnableGuardDuty` /
  `EnableSecurityHub`; final security-review checklist.
- **Depends on:** Every other subsystem (this is the closing gate).
- **Interfaces produced:**
  - `docs/security/stride.md`.
  - Stack props above.
  - Empty-or-justified `nag-suppressions.ts`.
- **Done when:**
  1. `cdk synth` is cdk-nag-clean with no suppressions, **or** every
     remaining suppression has a written justification reviewed in this
     subsystem's PR.
  2. STRIDE doc covers ingress, identity, secrets, data, audit.
  3. `EnableGuardDuty` / `EnableSecurityHub` stack props deploy the
     respective services in a dev stack when set to true.
  4. Aggregate v1 gate: a fresh `cdk deploy` from a clean account,
     followed by a scripted run-through of every other subsystem's
     acceptance criteria, passes end-to-end.
