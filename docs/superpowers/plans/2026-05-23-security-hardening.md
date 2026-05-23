# security-hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out v1 by removing every cdk-nag suppression that can be removed with code (not just config), tightening every IAM role to least privilege, writing the STRIDE threat model, and adding `EnableGuardDuty` / `EnableSecurityHub` stack props. Ends with the aggregate v1 ship gate.

**Architecture:** This subsystem is the closing gate, so it edits across every prior subsystem. Each task targets one cdk-nag suppression in `infra/lib/nag-suppressions.ts` (IAM4, IAM5, VPC7, L1, SNS3, DDB3) and either fixes the underlying code or rewrites the suppression with a defensible justification specific to v1 (not "deferred to v1.6"). New stack props add GuardDuty / Security Hub. STRIDE doc lives at `docs/security/stride.md`.

**Tech Stack:** AWS CDK v2, cdk-nag (AwsSolutions + HIPAA), TypeScript.

**Spec reference:** `docs/superpowers/specs/2026-05-23-search-agentcore-gateway-design.md` §6.4, §11.2.6, plus existing `infra/lib/nag-suppressions.ts`.

**Depends on:** every other subsystem (this is the final closing gate).

---

### Task 1: Inventory the current cdk-nag findings

**Files:**
- Create: `docs/security/nag-baseline-2026-05-23.md`

- [ ] **Step 1: Synth and capture all findings**

Run: `pnpm cdk synth --strict 2>&1 | tee /tmp/nag-out.txt`
Expected: list of `AwsSolutions-*` and `HIPAA.Security-*` findings.

- [ ] **Step 2: Write the baseline doc**

Create `docs/security/nag-baseline-2026-05-23.md` with one row per finding:

| Finding ID | Resource | Owner subsystem (file) | Plan (this task) |
|---|---|---|---|

Fill it in from `/tmp/nag-out.txt`. This becomes the source of truth for the rest of the plan.

- [ ] **Step 3: Commit**

```bash
git add docs/security/nag-baseline-2026-05-23.md
git commit -m "docs(security): capture cdk-nag baseline before hardening"
```

---

### Task 2: AwsSolutions-IAM4 — replace AWS-managed policies on AwsCustomResource

**Files:**
- Modify: `infra/lib/gateway/targets.ts` (and any other `AwsCustomResource` callsites)
- Modify: `infra/lib/nag-suppressions.ts`
- Test: `infra/test/iam-least-priv.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Template } from 'aws-cdk-lib/assertions';
import { App } from 'aws-cdk-lib';
import { SearchStack } from '../lib/stacks/search-stack.js';

describe('IAM4 hardening', () => {
  it('no role attaches AWSLambdaBasicExecutionRole as a managed policy', () => {
    const app = new App();
    const stack = new SearchStack(app, 'T', { env: { account: '111', region: 'us-east-1' } });
    const t = Template.fromStack(stack);
    const roles = t.findResources('AWS::IAM::Role');
    for (const role of Object.values(roles)) {
      const arns = (role as any).Properties?.ManagedPolicyArns ?? [];
      const flatArns = JSON.stringify(arns);
      expect(flatArns).not.toContain('AWSLambdaBasicExecutionRole');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter infra test -- iam-least-priv`
Expected: FAIL — `AwsCustomResource` defaults to the managed policy.

- [ ] **Step 3: Replace with inline policy**

For every `AwsCustomResource`, pass an explicit `role` (or use `Role` property) created with only the actions it needs (e.g., `bedrock-agentcore:CreateGatewayTarget`, `bedrock-agentcore:DeleteGatewayTarget`, plus `logs:CreateLogGroup/CreateLogStream/PutLogEvents` on the function's own log group ARN). Drop the `AWSLambdaBasicExecutionRole` attachment.

Remove the `AwsSolutions-IAM4` suppression from `nag-suppressions.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter infra test && pnpm cdk synth --strict`
Expected: PASS, no `AwsSolutions-IAM4` findings.

- [ ] **Step 5: Commit**

```bash
git add infra/lib/gateway/targets.ts infra/lib/nag-suppressions.ts infra/test/iam-least-priv.test.ts
git commit -m "fix(infra): inline IAM policies on AwsCustomResource (drop IAM4 suppression)"
```

---

### Task 3: AwsSolutions-IAM5 — scope `*` resources where possible

**Files:**
- Modify: every IAM grant currently using `'*'`
- Modify: `infra/lib/nag-suppressions.ts`
- Test: `infra/test/iam-least-priv.test.ts` (extend)

- [ ] **Step 1: Write the failing tests**

```ts
it('cloudwatch:PutMetricData is gated by a namespace condition', () => {
  // ...synth, find statements with PutMetricData, assert each has Condition.StringEquals['cloudwatch:namespace'] = 'SearchGateway'
});

it('bedrock-agentcore Create/Delete actions are scoped to the gateway resource ARN', () => {
  // assert no statement combines bedrock-agentcore:Create*/Delete* with Resource: '*'
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter infra test -- iam-least-priv`
Expected: FAIL.

- [ ] **Step 3: Tighten the policies**

For `cloudwatch:PutMetricData`, add `conditions: { StringEquals: { 'cloudwatch:namespace': 'SearchGateway' } }`.

For `bedrock-agentcore:Create*` / `Delete*`, scope `resources` to the gateway ARN (`arn:aws:bedrock-agentcore:${region}:${account}:gateway/${gatewayId}/*`). If a particular sub-action genuinely cannot be scoped (verify per AWS docs at implementation time), keep a per-action suppression with a specific reason citing the API contract — not a stack-wide one.

Remove the stack-wide `AwsSolutions-IAM5` suppression. Replace with per-construct suppressions only where unavoidable, each with a concrete justification.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter infra test && pnpm cdk synth --strict`
Expected: PASS, no stack-level IAM5 findings; any remaining are scoped per resource with specific reasons.

- [ ] **Step 5: Commit**

```bash
git add infra/lib/ infra/test/iam-least-priv.test.ts
git commit -m "fix(infra): scope IAM5 wildcards with conditions and resource ARNs"
```

---

### Task 4: AwsSolutions-VPC7 — flow logs to S3

**Files:**
- Modify: `infra/lib/security/network.ts` (or wherever the VPC is created)
- Modify: `infra/lib/nag-suppressions.ts`

- [ ] **Step 1: Add S3 destination**

In addition to the existing CloudWatch flow log, add a second flow log targeting an `S3` destination — the same audit export bucket created in `operability-and-audit` Task 6 (or a separate flow-logs bucket if reusing the audit bucket would mix retention requirements; choose one and document the choice in a code comment).

- [ ] **Step 2: Verify**

Run: `pnpm cdk synth --strict`
Expected: no `AwsSolutions-VPC7` finding.

Remove the suppression.

- [ ] **Step 3: Commit**

```bash
git add infra/lib/security/network.ts infra/lib/nag-suppressions.ts
git commit -m "fix(infra): vpc flow logs to S3 (drop VPC7 suppression)"
```

---

### Task 5: AwsSolutions-L1 — runtime upgrade or per-resource pin

**Files:**
- Modify: every `Runtime.NODEJS_20_X` site to use `Runtime.NODEJS_22_X` if compatible
- Modify: `infra/lib/nag-suppressions.ts`

- [ ] **Step 1: Probe compatibility**

Test that `bedrock-agentcore-control` SDK functions (used by `AwsCustomResource` in `gateway/targets.ts`) work on Node 22. Run a small script locally with the bundled SDK against `node:22`.

- [ ] **Step 2: Bump runtime in CDK**

If compatible, replace `Runtime.NODEJS_20_X` with `Runtime.NODEJS_22_X` everywhere. Drop the L1 suppression.

If a specific resource is genuinely blocked (verify with a runtime smoke test), keep a per-resource suppression with the reason "v22 incompatible with <library/SDK> as of <date>" — not a stack-wide suppression.

- [ ] **Step 3: Verify**

Run: `pnpm cdk synth --strict && pnpm --filter infra test`
Expected: PASS, no L1 findings (or only a per-resource suppression with a specific reason).

- [ ] **Step 4: Deploy and smoke-test in dev**

Run: `pnpm cdk deploy --context env=dev`
Then run `scripts/mcp-call.sh search_arxiv '{"query":"cats"}'` and `walkthrough.sh` from `admin-bff`.
Expected: both succeed.

- [ ] **Step 5: Commit**

```bash
git add infra/ infra/lib/nag-suppressions.ts
git commit -m "fix(infra): bump Lambda runtime to nodejs22 (drop L1 suppression)"
```

---

### Task 6: AwsSolutions-SNS3 — SSL enforcement on alarm topic

**Files:**
- Modify: `infra/lib/security/sns.ts` (or wherever the topic is created)
- Modify: `infra/lib/nag-suppressions.ts`

- [ ] **Step 1: Add SSL-only topic policy**

```ts
import { Effect, PolicyStatement, AnyPrincipal } from 'aws-cdk-lib/aws-iam';

topic.addToResourcePolicy(
  new PolicyStatement({
    effect: Effect.DENY,
    principals: [new AnyPrincipal()],
    actions: ['sns:Publish'],
    resources: [topic.topicArn],
    conditions: { Bool: { 'aws:SecureTransport': 'false' } }
  })
);
```

Optionally wrap the topic in CMK encryption (KMS-encrypted SNS) using the existing data-key alias from `infra/lib/security/kms.ts`.

- [ ] **Step 2: Verify**

Run: `pnpm cdk synth --strict`
Expected: no SNS3 finding.

Drop the suppression.

- [ ] **Step 3: Commit**

```bash
git add infra/lib/security/sns.ts infra/lib/nag-suppressions.ts
git commit -m "fix(infra): SSL-only policy + KMS encryption on alarm topic (drop SNS3)"
```

---

### Task 7: AwsSolutions-DDB3 — keep with strengthened justification

**Files:**
- Modify: `infra/lib/nag-suppressions.ts`

- [ ] **Step 1: Move from stack-wide to per-resource**

Replace the stack-wide `AwsSolutions-DDB3` suppression with one targeted at `QuotaTable` only:

```ts
NagSuppressions.addResourceSuppressions(quotaTable, [
  {
    id: 'AwsSolutions-DDB3',
    reason: 'QuotaTable rows are ephemeral RPM/daily counters with TTL ≤ 24h. Loss of the table is recoverable in <60s by recreation; PITR provides no operational value and adds cost. ConfigTable and AuditLogTable (durable) have PITR enabled.'
  }
]);
```

Remove from the stack-level list.

- [ ] **Step 2: Verify**

Run: `pnpm cdk synth --strict`
Expected: only one DDB3 finding, suppressed at the resource level with the strengthened reason.

- [ ] **Step 3: Commit**

```bash
git add infra/lib/nag-suppressions.ts
git commit -m "chore(infra): scope DDB3 suppression to QuotaTable with strengthened reason"
```

---

### Task 8: STRIDE threat model

**Files:**
- Create: `docs/security/stride.md`

- [ ] **Step 1: Write the doc**

Use this skeleton (fill in concrete threats per row):

```markdown
# STRIDE Threat Model — search-agentcore-gateway v1

## Trust boundaries
1. Internet → CloudFront (admin) / Public MCP endpoint (Gateway)
2. CloudFront → Admin Lambda Function URL (IAM-signed via OAC)
3. AgentCore Gateway → search-router Lambda (IAM)
4. search-router Lambda → Provider APIs (TLS, API key)
5. Admin Lambda → DynamoDB / Secrets Manager / KMS (IAM)
6. Reconciler Lambda → AgentCore control plane (IAM)
7. DDB Streams → audit-export Lambda → S3 (Object Lock)

## Per-component STRIDE
### MCP Gateway endpoint
- **S**: Cognito JWT-bound caller identity. Mitigation: aws-jwt-verify + role.
- **T**: payload tamper. Mitigation: TLS 1.2+, MCP-over-HTTPS only.
- **R**: which client called what. Mitigation: AuditLogTable + CloudTrail.
- **I**: secret leakage in logs. Mitigation: structured logger redacts `apiKey`, `secret*`.
- **D**: hard quota + WAF rate limit on admin path.
- **E**: role escalation. Mitigation: groups → role mapping is fixed in middleware.

### Admin Console BFF
- (one row per STRIDE letter — same shape as above)

### search-router Lambda
- ...

### Reconciler Lambda
- ...

### Provider secrets (Secrets Manager)
- ...

### Audit export bucket
- ...
```

Each section needs at least one concrete threat with a concrete mitigation. No "TBD".

- [ ] **Step 2: Commit**

```bash
git add docs/security/stride.md
git commit -m "docs(security): STRIDE threat model"
```

---

### Task 9: GuardDuty / Security Hub stack props

**Files:**
- Create: `infra/lib/security/guardduty.ts`
- Create: `infra/lib/security/securityhub.ts`
- Modify: `infra/lib/stacks/observability-stack.ts` (or a new SecurityStack)
- Modify: `infra/bin/app.ts`
- Test: `infra/test/security-flags.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Template } from 'aws-cdk-lib/assertions';
import { App } from 'aws-cdk-lib';
import { ObservabilityStack } from '../lib/stacks/observability-stack.js';

describe('security flags', () => {
  it('does not create GuardDuty / SecurityHub by default', () => {
    const app = new App();
    const s = new ObservabilityStack(app, 'T', { /* required props */ } as any);
    const t = Template.fromStack(s);
    expect(Object.keys(t.findResources('AWS::GuardDuty::Detector'))).toHaveLength(0);
    expect(Object.keys(t.findResources('AWS::SecurityHub::Hub'))).toHaveLength(0);
  });

  it('creates GuardDuty + SecurityHub when flags are set', () => {
    const app = new App();
    const s = new ObservabilityStack(app, 'T', { /* required props */, enableGuardDuty: true, enableSecurityHub: true } as any);
    const t = Template.fromStack(s);
    expect(Object.keys(t.findResources('AWS::GuardDuty::Detector'))).toHaveLength(1);
    expect(Object.keys(t.findResources('AWS::SecurityHub::Hub'))).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter infra test -- security-flags`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`guardduty.ts`:

```ts
import { Construct } from 'constructs';
import { CfnDetector } from 'aws-cdk-lib/aws-guardduty';

export function enableGuardDuty(scope: Construct): void {
  new CfnDetector(scope, 'GuardDuty', { enable: true, findingPublishingFrequency: 'FIFTEEN_MINUTES' });
}
```

`securityhub.ts`:

```ts
import { Construct } from 'constructs';
import { CfnHub } from 'aws-cdk-lib/aws-securityhub';

export function enableSecurityHub(scope: Construct): void {
  new CfnHub(scope, 'SecurityHub', {});
}
```

In `ObservabilityStackProps` add `enableGuardDuty?: boolean; enableSecurityHub?: boolean;`. Call the helpers conditionally.

In `infra/bin/app.ts` read `enableGuardDuty` and `enableSecurityHub` from CDK context and pass through.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter infra test && pnpm cdk synth && pnpm cdk synth --context enableGuardDuty=true --context enableSecurityHub=true`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add infra/lib/security/guardduty.ts infra/lib/security/securityhub.ts infra/lib/stacks/observability-stack.ts infra/bin/app.ts infra/test/security-flags.test.ts
git commit -m "feat(infra): EnableGuardDuty / EnableSecurityHub stack props"
```

---

### Task 10: Final cdk-nag check

**Files:**
- Modify: `infra/lib/nag-suppressions.ts` (any final cleanup)

- [ ] **Step 1: Synth strict**

Run: `pnpm cdk synth --strict 2>&1 | tee /tmp/nag-final.txt`
Expected: zero findings — OR every remaining finding has a per-resource suppression with a specific (not generic, not "deferred") reason.

- [ ] **Step 2: Verify the suppression file**

`infra/lib/nag-suppressions.ts` should now be either empty (preferred) or contain only resource-level suppressions, each with a documented justification. The function `applyV1NagSuppressions` may still exist as a no-op or be deleted entirely.

- [ ] **Step 3: Commit**

```bash
git add infra/lib/nag-suppressions.ts
git commit -m "chore(infra): final nag-suppressions cleanup for v1"
```

---

### Task 11: Aggregate v1 ship gate

**Files:**
- Create: `scripts/v1-ship-check.sh`

- [ ] **Step 1: Write the gate script**

`scripts/v1-ship-check.sh` runs every prior subsystem's acceptance check end-to-end against a freshly deployed account:

```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. fresh deploy
pnpm cdk deploy --all --context env=dev --context enableSearxng=true --require-approval never

# 2. v1.0 walking-skeleton checks
scripts/mcp-call.sh search_arxiv '{"query":"cats"}'
scripts/load/quota-saturate.sh search_arxiv  # expects RATE_LIMITED
scripts/ops/induce-arxiv-error.sh             # alarm fires
pnpm cdk synth --strict                        # cdk-nag clean

# 3. multi-provider-search
for tool in search_exa search_perplexity search_you search_unified; do
  scripts/mcp-call.sh "$tool" '{"query":"connectivity"}'
done

# 4. admin-bff (and admin-ui golden path)
JWT=$(scripts/admin-curl/login.sh) ADMIN_URL=https://"$ADMIN_DIST" scripts/admin-curl/walkthrough.sh
pnpm --filter admin-console exec playwright test

# 5. searxng (with the flag on)
scripts/mcp-call.sh search_searxng '{"query":"open source search"}'

# 6. operability-and-audit
scripts/ops/force-alarms.sh
scripts/ops/induce-reconciler-drift.sh   # provided by op-and-audit Task 10

echo "v1 ship gate: PASS"
```

- [ ] **Step 2: Dry-run the gate**

Run: `scripts/v1-ship-check.sh`
Expected: PASS end-to-end.

- [ ] **Step 3: Commit**

```bash
git add scripts/v1-ship-check.sh scripts/load/ scripts/ops/induce-arxiv-error.sh scripts/ops/induce-reconciler-drift.sh
git commit -m "chore(ops): v1 aggregate ship gate"
```

---

## Acceptance (mirrors spec §11.2.6)

1. `cdk synth --strict` is cdk-nag-clean with no suppressions, **or** every remaining suppression has a written justification reviewed in this subsystem's PR (Tasks 2–7, 10).
2. STRIDE doc covers ingress, identity, secrets, data, audit (Task 8 — `docs/security/stride.md`).
3. `EnableGuardDuty` / `EnableSecurityHub` stack props deploy the respective services in a dev stack when set to true (Task 9).
4. Aggregate v1 gate: a fresh `cdk deploy` from a clean account, followed by a scripted run-through of every other subsystem's acceptance criteria, passes end-to-end (Task 11).
