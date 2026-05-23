# searxng-adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a self-hosted SearXNG metasearch adapter — Fargate service in private subnets behind an internal ALB, plus a `searxng` Lambda adapter that calls it. Default-disabled; opt-in via a stack prop.

**Architecture:** A single SearXNG container (`searxng/searxng`) on Fargate, sized small (0.5 vCPU / 1 GiB) with two replicas for HA. An internal ALB exposes it on a private DNS name to the search-router Lambda only. The adapter follows the existing `Adapter` contract from `multi-provider-search`, calls SearXNG's `/search?format=json` endpoint, and registers itself in the search-router runtime when ConfigTable has it `enabled: true`. The whole subsystem is gated by a CDK stack prop `enableSearxng: boolean`.

**Tech Stack:** TypeScript, AWS CDK v2, Fargate (`aws-cdk-lib/aws-ecs`), internal ALB, vitest.

**Spec reference:** `docs/superpowers/specs/2026-05-23-search-agentcore-gateway-design.md` §1, §4.1, §4.2, §11.2.4.

**Depends on:** `multi-provider-search` (adapter contract + `search_unified` registration + ConfigTable seed pattern).

---

### Task 1: SearXNG Lambda adapter

**Files:**
- Create: `packages/adapters/src/searxng.ts`
- Test: `packages/adapters/src/__tests__/searxng.test.ts`
- Modify: `packages/adapters/src/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { searxngAdapter } from '../searxng.js';

const fixture = {
  results: [
    { title: 'A', url: 'https://a', content: 'snip A' },
    { title: 'B', url: 'https://b', content: 'snip B' }
  ]
};

describe('searxngAdapter', () => {
  afterEach(() => vi.restoreAllMocks());

  it('maps response to SearchResult[]', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => fixture }));
    const out = await searxngAdapter.search('cats', { topK: 2, baseUrl: 'http://searxng.internal' });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ title: 'A', url: 'https://a', provider: 'searxng', rank: 1 });
  });

  it('throws INTERNAL when baseUrl is missing', async () => {
    await expect(searxngAdapter.search('cats', {})).rejects.toThrow(/INTERNAL/);
  });

  it('throws UPSTREAM_ERROR on 5xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502, text: async () => '' }));
    await expect(searxngAdapter.search('cats', { baseUrl: 'http://x' })).rejects.toThrow(/UPSTREAM_ERROR/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @search-gateway/adapters test -- searxng`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`SearchOpts` already includes `baseUrl?: string` if defined; if not, extend it in `@search-gateway/shared/types.ts` first.

```ts
import {
  type Adapter,
  type SearchOpts,
  type SearchResult,
  ErrorCode,
  SearchError
} from '@search-gateway/shared';

const TIMEOUT_MS = 8_000;

export const searxngAdapter: Adapter = {
  name: 'searxng',
  category: 'web',
  requiresApiKey: false,

  async search(query: string, opts?: SearchOpts): Promise<SearchResult[]> {
    if (!query.trim()) {
      throw new SearchError(ErrorCode.INVALID_ARGUMENT, 'query must be non-empty', { provider: 'searxng' });
    }
    if (!opts?.baseUrl) {
      throw new SearchError(ErrorCode.INTERNAL, 'searxng baseUrl not configured', { provider: 'searxng' });
    }
    const url = new URL('/search', opts.baseUrl);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ac.signal });
      if (!res.ok) {
        throw new SearchError(ErrorCode.UPSTREAM_ERROR, `searxng ${res.status}`, { provider: 'searxng' });
      }
      const data = (await res.json()) as { results: Array<{ title: string; url: string; content?: string }> };
      const top = data.results.slice(0, opts?.topK ?? 10);
      return top.map((r, i) => ({
        title: r.title,
        url: r.url,
        snippet: r.content ?? '',
        provider: 'searxng',
        rank: i + 1
      }));
    } finally {
      clearTimeout(t);
    }
  }
};
```

Register in `packages/adapters/src/index.ts`:

```ts
import { searxngAdapter } from './searxng.js';
registerAdapter(searxngAdapter);
export { searxngAdapter };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @search-gateway/adapters test -- searxng`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/searxng.ts packages/adapters/src/__tests__/searxng.test.ts packages/adapters/src/index.ts packages/shared/src/types.ts
git commit -m "feat(adapters): searxng adapter (calls self-hosted SearXNG)"
```

---

### Task 2: Plumb `baseUrl` from ConfigTable through the router

**Files:**
- Modify: `packages/shared/src/provider-config.ts`
- Modify: `packages/search-router/src/handler.ts` (read `baseUrl` from config)
- Modify: `packages/search-router/src/entry.ts`
- Test: `packages/shared/src/__tests__/provider-config.test.ts` (extend)

- [ ] **Step 1: Extend the schema test**

Add to existing `provider-config.test.ts`:

```ts
it('accepts an optional baseUrl', () => {
  const row = {
    providerId: 'searxng',
    enabled: true,
    quota: { rpm: 60, daily: 10000 },
    timeoutMs: 8000,
    baseUrl: 'http://searxng.internal:8080'
  };
  expect(parseProviderConfig(row).baseUrl).toBe('http://searxng.internal:8080');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @search-gateway/shared test -- provider-config`
Expected: FAIL.

- [ ] **Step 3: Extend the schema**

```ts
export const ProviderConfigSchema = z.object({
  providerId: z.string().min(1),
  enabled: z.boolean(),
  secretArn: z.string().optional(),
  baseUrl: z.string().url().optional(),
  quota: z.object({ rpm: z.number().int().nonnegative(), daily: z.number().int().nonnegative() }),
  timeoutMs: z.number().int().positive()
});
```

In `handler.ts`, when invoking the adapter, pass `baseUrl` from the loaded `ProviderConfig` into `SearchOpts`. In `entry.ts`, build a per-provider `SearchOpts` map at cold start so the handler doesn't read DDB on every call.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @search-gateway/shared test && pnpm --filter search-router test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/provider-config.ts packages/search-router/src/handler.ts packages/search-router/src/entry.ts packages/shared/src/__tests__/provider-config.test.ts
git commit -m "feat(router): pass baseUrl from ConfigTable to adapter"
```

---

### Task 3: SearXNG Fargate construct

**Files:**
- Create: `infra/lib/searxng/searxng-service.ts`
- Test: `infra/test/searxng-service.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { Template } from 'aws-cdk-lib/assertions';
import { App, Stack } from 'aws-cdk-lib';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { SearxngService } from '../lib/searxng/searxng-service.js';

it('creates Fargate service + internal ALB + listener', () => {
  const app = new App();
  const stack = new Stack(app, 'T', { env: { account: '111', region: 'us-east-1' } });
  const vpc = new Vpc(stack, 'V');
  new SearxngService(stack, 'X', { vpc });
  const t = Template.fromStack(stack);
  t.resourceCountIs('AWS::ECS::Cluster', 1);
  t.resourceCountIs('AWS::ECS::Service', 1);
  t.resourceCountIs('AWS::ECS::TaskDefinition', 1);
  t.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', { Scheme: 'internal' });
});

it('exposes a DNS name for the search-router to consume', () => {
  const app = new App();
  const stack = new Stack(app, 'T', { env: { account: '111', region: 'us-east-1' } });
  const vpc = new Vpc(stack, 'V');
  const svc = new SearxngService(stack, 'X', { vpc });
  expect(svc.endpoint).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter infra test -- searxng-service`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
import { Construct } from 'constructs';
import { Cluster, FargateTaskDefinition, ContainerImage, FargateService, LogDriver } from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancer, ApplicationProtocol, ListenerAction, ApplicationTargetGroup, TargetType } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { type IVpc, SubnetType, Port } from 'aws-cdk-lib/aws-ec2';

export interface SearxngServiceProps {
  vpc: IVpc;
  desiredCount?: number;
}

export class SearxngService extends Construct {
  readonly endpoint: string;
  readonly service: FargateService;

  constructor(scope: Construct, id: string, props: SearxngServiceProps) {
    super(scope, id);
    const cluster = new Cluster(this, 'Cluster', { vpc: props.vpc, containerInsights: true });
    const logs = new LogGroup(this, 'Logs', { retention: RetentionDays.ONE_MONTH });
    const td = new FargateTaskDefinition(this, 'Td', { cpu: 512, memoryLimitMiB: 1024 });
    td.addContainer('searxng', {
      image: ContainerImage.fromRegistry('searxng/searxng:latest'),
      portMappings: [{ containerPort: 8080 }],
      logging: LogDriver.awsLogs({ logGroup: logs, streamPrefix: 'searxng' }),
      environment: { BASE_URL: 'http://localhost:8080/', INSTANCE_NAME: 'gateway-searxng' }
    });

    const svc = new FargateService(this, 'Svc', {
      cluster,
      taskDefinition: td,
      desiredCount: props.desiredCount ?? 2,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      assignPublicIp: false
    });

    const alb = new ApplicationLoadBalancer(this, 'Alb', { vpc: props.vpc, internetFacing: false });
    const tg = new ApplicationTargetGroup(this, 'Tg', {
      vpc: props.vpc,
      protocol: ApplicationProtocol.HTTP,
      port: 8080,
      targetType: TargetType.IP,
      healthCheck: { path: '/healthz' }
    });
    svc.attachToApplicationTargetGroup(tg);
    alb.addListener('Http', { port: 80, defaultAction: ListenerAction.forward([tg]) });
    svc.connections.allowFrom(alb, Port.tcp(8080));

    this.service = svc;
    this.endpoint = `http://${alb.loadBalancerDnsName}`;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter infra test -- searxng-service && pnpm cdk synth`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add infra/lib/searxng/searxng-service.ts infra/test/searxng-service.test.ts
git commit -m "feat(infra): searxng fargate service + internal ALB"
```

---

### Task 4: Stack-prop gate + wire into search stack

**Files:**
- Modify: `infra/lib/stacks/search-stack.ts`
- Modify: `infra/bin/app.ts`
- Test: `infra/test/searxng-feature-flag.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { Template } from 'aws-cdk-lib/assertions';
import { App } from 'aws-cdk-lib';
import { SearchStack } from '../lib/stacks/search-stack.js';

it('does NOT create searxng resources when enableSearxng is false', () => {
  const app = new App();
  const stack = new SearchStack(app, 'T', { env: { account: '111', region: 'us-east-1' }, enableSearxng: false });
  const t = Template.fromStack(stack);
  expect(Object.keys(t.findResources('AWS::ECS::Service'))).toHaveLength(0);
});

it('creates searxng resources when enableSearxng is true', () => {
  const app = new App();
  const stack = new SearchStack(app, 'T', { env: { account: '111', region: 'us-east-1' }, enableSearxng: true });
  const t = Template.fromStack(stack);
  expect(Object.keys(t.findResources('AWS::ECS::Service'))).toHaveLength(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter infra test -- searxng-feature-flag`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Extend `SearchStackProps`:

```ts
export interface SearchStackProps extends StackProps {
  enableSearxng?: boolean;
}
```

In the constructor:

```ts
if (props.enableSearxng) {
  const searxng = new SearxngService(this, 'Searxng', { vpc: this.vpc });
  // grant the search-router lambda access to the internal ALB
  searxng.service.connections.allowFrom(this.searchRouter, Port.tcp(80));
  // pass baseUrl to router
  this.searchRouter.addEnvironment('SEARXNG_BASE_URL', searxng.endpoint);
}
```

In `infra/bin/app.ts`, read the flag from CDK context:

```ts
const enableSearxng = app.node.tryGetContext('enableSearxng') === true;
new SearchStack(app, 'SearchStack', { env, enableSearxng });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter infra test && pnpm cdk synth && pnpm cdk synth --context enableSearxng=true`
Expected: PASS for both. Default synth has no ECS resources.

- [ ] **Step 5: Commit**

```bash
git add infra/lib/stacks/search-stack.ts infra/bin/app.ts infra/test/searxng-feature-flag.test.ts
git commit -m "feat(infra): enableSearxng stack prop wires SearxngService"
```

---

### Task 5: Seed ConfigTable row for searxng

**Files:**
- Modify: `infra/lib/data/config-seed.ts` (added in `multi-provider-search` Task 12)

- [ ] **Step 1: Add seed row**

Add a `searxng` row with `enabled: false`, `baseUrl: <stack-output of internal ALB DNS>`, `quota: { rpm: 60, daily: 10000 }`, `timeoutMs: 8000`. When `enableSearxng: false` the seed still inserts a placeholder row (so the BFF can list it as a provider, even though calls will fail until the service exists). Document this in a comment on the seed line.

- [ ] **Step 2: Verify**

Run: `pnpm --filter infra test && pnpm cdk synth --context enableSearxng=true`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add infra/lib/data/config-seed.ts
git commit -m "chore(infra): seed searxng provider row (default disabled)"
```

---

### Task 6: Register search_searxng as a Gateway target

**Files:**
- Modify: `infra/lib/gateway/targets.ts` (touched in `multi-provider-search` Task 11)

- [ ] **Step 1: Conditionally include `search_searxng` in the target list**

Pull the tool list from a derived array:

```ts
const tools = [
  'search_arxiv',
  'search_exa',
  'search_perplexity',
  'search_you',
  'search_unified',
  ...(props.enableSearxng ? ['search_searxng'] : [])
];
```

Pass `enableSearxng` from `SearchStack` into the targets construct.

- [ ] **Step 2: Verify**

Run: `pnpm --filter infra test && pnpm cdk synth --context enableSearxng=true`
Expected: PASS — the target count includes `search_searxng` only when the flag is on.

- [ ] **Step 3: Commit**

```bash
git add infra/lib/gateway/targets.ts infra/lib/stacks/search-stack.ts
git commit -m "feat(infra): register search_searxng target when enableSearxng=true"
```

---

### Task 7: Deploy + smoke-test

**Files:** none

- [ ] **Step 1: Deploy with the flag on**

Run: `pnpm cdk deploy --context env=dev --context enableSearxng=true`
Expected: clean deploy. Wait for the Fargate service to reach `RUNNING` status (≈3 min).

- [ ] **Step 2: Flip ConfigTable row to enabled**

Run the curl walkthrough from `admin-bff` (`PUT /api/providers/searxng` with `enabled: true`) — or `aws dynamodb update-item` directly if `admin-bff` isn't deployed yet.

- [ ] **Step 3: Smoke-test the tool**

Run: `scripts/mcp-call.sh search_searxng '{"query":"open source search"}'`
Expected: non-empty `results` array.

- [ ] **Step 4: Smoke-test `search_unified` includes searxng**

Run: `scripts/mcp-call.sh search_unified '{"query":"open source search","topK":10}'`
Expected: at least one result has `provider` containing `searxng`.

- [ ] **Step 5: Verify default deploy is unchanged**

Tear down, then deploy without the flag:

Run: `pnpm cdk deploy --context env=dev` (no `enableSearxng`)
Expected: no Fargate, no ALB, no `search_searxng` target.

---

## Acceptance (mirrors spec §11.2.4)

1. Stack prop `enableSearxng: true` deploys SearXNG and registers the adapter; default deploy is unchanged (Tasks 4, 6, 7).
2. `search_searxng` returns results in a deployed env (Task 7 Step 3).
3. `search_unified` includes searxng results when enabled (Task 7 Step 4).
