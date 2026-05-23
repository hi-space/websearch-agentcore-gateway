# operability-and-audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the v1.0 walking-skeleton observability (one alarm, no dashboard, no audit export) to production-grade: full CloudWatch dashboard with per-provider widgets, the full alarm set, a Reconciler Lambda that detects drift between ConfigTable and the Gateway, CloudTrail data events on Secrets / KMS / DynamoDB, and an immutable S3 export of AuditLogTable.

**Architecture:** A new `ObservabilityStack` owns the dashboard, alarms, Reconciler Lambda, CloudTrail trail, and the S3 Object-Lock bucket. The dashboard is built from a typed `DashboardSpec` so it survives refactors. The Reconciler runs on an EventBridge schedule (every 15 min), pulls ConfigTable, calls AgentCore Gateway `listTargets`, and emits a metric + log entry per drift. AuditLogTable streams (DDB Streams → Lambda) to a versioned, Object-Lock-enabled S3 bucket.

**Tech Stack:** AWS CDK v2 (TypeScript), CloudWatch dashboards/alarms, EventBridge, Lambda (Node 20 ARM64), DynamoDB Streams, S3 with Object Lock (compliance mode), CloudTrail.

**Spec reference:** `docs/superpowers/specs/2026-05-23-search-agentcore-gateway-design.md` §4.2 (operability), §6, §11.2.5.

**Depends on:** `multi-provider-search` (per-provider EMF metrics) and `admin-bff` (audit row schema).

---

### Task 1: Typed DashboardSpec

**Files:**
- Create: `infra/lib/observability/dashboard-spec.ts`
- Test: `infra/test/dashboard-spec.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { buildDashboardBody } from '../lib/observability/dashboard-spec.js';

describe('buildDashboardBody', () => {
  it('produces one widget per provider plus a unified summary widget', () => {
    const body = buildDashboardBody({
      providers: ['exa', 'tavily'],
      namespace: 'SearchGateway',
      region: 'us-east-1'
    });
    const parsed = JSON.parse(body);
    const titles = parsed.widgets.map((w: any) => w.properties.title);
    expect(titles).toContain('exa');
    expect(titles).toContain('tavily');
    expect(titles).toContain('search_unified');
    expect(titles).toContain('admin');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter infra test -- dashboard-spec`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
export interface DashboardSpec {
  providers: string[];
  namespace: string;
  region: string;
}

interface Widget {
  type: 'metric';
  properties: { title: string; metrics: unknown[]; region: string; stat: string; period: number };
}

function providerWidget(spec: DashboardSpec, provider: string): Widget {
  return {
    type: 'metric',
    properties: {
      title: provider,
      region: spec.region,
      stat: 'p95',
      period: 60,
      metrics: [
        [spec.namespace, 'Latency', 'provider', provider],
        ['.', 'ErrorRate', '.', '.'],
        ['.', 'Calls', '.', '.']
      ]
    }
  };
}

function unifiedWidget(spec: DashboardSpec): Widget {
  return {
    type: 'metric',
    properties: {
      title: 'search_unified',
      region: spec.region,
      stat: 'p95',
      period: 60,
      metrics: [
        [spec.namespace, 'Latency', 'tool', 'search_unified'],
        ['.', 'FanOutFailures', '.', '.']
      ]
    }
  };
}

function adminWidget(spec: DashboardSpec): Widget {
  return {
    type: 'metric',
    properties: {
      title: 'admin',
      region: spec.region,
      stat: 'p95',
      period: 60,
      metrics: [
        [spec.namespace, 'AdminLatency'],
        ['.', 'AdminErrors'],
        ['.', 'RevealCount']
      ]
    }
  };
}

export function buildDashboardBody(spec: DashboardSpec): string {
  const widgets: Widget[] = [
    ...spec.providers.map((p) => providerWidget(spec, p)),
    unifiedWidget(spec),
    adminWidget(spec)
  ];
  return JSON.stringify({ widgets });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter infra test -- dashboard-spec`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add infra/lib/observability/dashboard-spec.ts infra/test/dashboard-spec.test.ts
git commit -m "feat(infra): typed dashboard spec builder"
```

---

### Task 2: Alarm spec

**Files:**
- Create: `infra/lib/observability/alarm-spec.ts`
- Test: `infra/test/alarm-spec.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { listAlarmDefinitions } from '../lib/observability/alarm-spec.js';

describe('listAlarmDefinitions', () => {
  it('returns 4 alarm definitions per enabled provider plus 2 admin alarms', () => {
    const defs = listAlarmDefinitions(['exa', 'tavily']);
    // per provider: error rate, p95, quota saturation, fan-out failure
    expect(defs.filter((d) => d.id.startsWith('exa.'))).toHaveLength(4);
    expect(defs.filter((d) => d.id.startsWith('tavily.'))).toHaveLength(4);
    // admin: reveal-rate spike, admin error rate
    expect(defs.filter((d) => d.id.startsWith('admin.'))).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter infra test -- alarm-spec`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
export interface AlarmDefinition {
  id: string;
  metricName: string;
  dimensions: Record<string, string>;
  threshold: number;
  evaluationPeriods: number;
  statistic: string;
  period: number;
  comparator: 'GreaterThanThreshold' | 'LessThanThreshold';
}

const PROVIDER_ALARMS: Array<Omit<AlarmDefinition, 'id' | 'dimensions'> & { suffix: string }> = [
  { suffix: 'errorRate', metricName: 'ErrorRate', threshold: 0.05, evaluationPeriods: 3, statistic: 'Average', period: 60, comparator: 'GreaterThanThreshold' },
  { suffix: 'p95', metricName: 'Latency', threshold: 5000, evaluationPeriods: 5, statistic: 'p95', period: 60, comparator: 'GreaterThanThreshold' },
  { suffix: 'quota', metricName: 'QuotaSaturation', threshold: 0.9, evaluationPeriods: 3, statistic: 'Average', period: 60, comparator: 'GreaterThanThreshold' },
  { suffix: 'fanOut', metricName: 'FanOutFailures', threshold: 3, evaluationPeriods: 3, statistic: 'Sum', period: 60, comparator: 'GreaterThanThreshold' }
];

const ADMIN_ALARMS: Array<Omit<AlarmDefinition, 'id' | 'dimensions'> & { suffix: string }> = [
  { suffix: 'revealSpike', metricName: 'RevealCount', threshold: 10, evaluationPeriods: 1, statistic: 'Sum', period: 300, comparator: 'GreaterThanThreshold' },
  { suffix: 'errorRate', metricName: 'AdminErrors', threshold: 5, evaluationPeriods: 3, statistic: 'Sum', period: 60, comparator: 'GreaterThanThreshold' }
];

export function listAlarmDefinitions(providers: string[]): AlarmDefinition[] {
  const out: AlarmDefinition[] = [];
  for (const p of providers) {
    for (const a of PROVIDER_ALARMS) {
      out.push({ id: `${p}.${a.suffix}`, dimensions: { provider: p }, ...a });
    }
  }
  for (const a of ADMIN_ALARMS) {
    out.push({ id: `admin.${a.suffix}`, dimensions: {}, ...a });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter infra test -- alarm-spec`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add infra/lib/observability/alarm-spec.ts infra/test/alarm-spec.test.ts
git commit -m "feat(infra): alarm definition spec"
```

---

### Task 3: ObservabilityStack — dashboard + alarms

**Files:**
- Create: `infra/lib/stacks/observability-stack.ts`
- Test: `infra/test/observability-stack.test.ts`
- Modify: `infra/bin/app.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { Template } from 'aws-cdk-lib/assertions';
import { App } from 'aws-cdk-lib';
import { ObservabilityStack } from '../lib/stacks/observability-stack.js';

it('creates dashboard + alarm per definition', () => {
  const app = new App();
  const s = new ObservabilityStack(app, 'T', {
    env: { account: '111', region: 'us-east-1' },
    providers: ['exa', 'tavily'],
    snsTopicArn: 'arn:aws:sns:us-east-1:111:t',
    auditTableName: 'AuditLogTable',
    auditTableStreamArn: 'arn:aws:dynamodb:us-east-1:111:table/AuditLogTable/stream/2026',
    auditTableArn: 'arn:aws:dynamodb:us-east-1:111:table/AuditLogTable',
    configTableName: 'ConfigTable',
    gatewayId: 'gw-123'
  });
  const t = Template.fromStack(s);
  t.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
  // 4 per provider × 2 providers + 2 admin = 10
  expect(Object.keys(t.findResources('AWS::CloudWatch::Alarm'))).toHaveLength(10);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter infra test -- observability-stack`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
import { Stack, type StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Dashboard, Alarm, Metric, ComparisonOperator } from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { buildDashboardBody } from '../observability/dashboard-spec.js';
import { listAlarmDefinitions } from '../observability/alarm-spec.js';

export interface ObservabilityStackProps extends StackProps {
  providers: string[];
  snsTopicArn: string;
  auditTableName: string;
  auditTableArn: string;
  auditTableStreamArn: string;
  configTableName: string;
  gatewayId: string;
}

export class ObservabilityStack extends Stack {
  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);

    new Dashboard(this, 'Dashboard', {
      dashboardName: 'search-gateway',
      dashboardBody: buildDashboardBody({
        providers: props.providers,
        namespace: 'SearchGateway',
        region: this.region
      })
    });

    const topic = Topic.fromTopicArn(this, 'AlarmTopic', props.snsTopicArn);
    for (const def of listAlarmDefinitions(props.providers)) {
      const a = new Alarm(this, `A_${def.id.replace('.', '_')}`, {
        metric: new Metric({
          namespace: 'SearchGateway',
          metricName: def.metricName,
          dimensionsMap: def.dimensions,
          statistic: def.statistic,
          period: Duration.seconds(def.period)
        }),
        evaluationPeriods: def.evaluationPeriods,
        threshold: def.threshold,
        comparisonOperator: def.comparator === 'GreaterThanThreshold'
          ? ComparisonOperator.GREATER_THAN_THRESHOLD
          : ComparisonOperator.LESS_THAN_THRESHOLD,
        alarmName: `sg-${def.id}`
      });
      a.addAlarmAction(new SnsAction(topic));
    }
    // remaining tasks (4–7) attach more constructs to this stack
  }
}
```

Wire into `infra/bin/app.ts` as a separate stack instantiated after `SearchStack` and `AdminConsoleStack`, passing the relevant outputs.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter infra test -- observability-stack && pnpm cdk synth`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add infra/lib/stacks/observability-stack.ts infra/test/observability-stack.test.ts infra/bin/app.ts
git commit -m "feat(infra): observability stack with dashboard + alarms"
```

---

### Task 4: Reconciler Lambda

**Files:**
- Create: `packages/reconciler/package.json`
- Create: `packages/reconciler/src/handler.ts`
- Create: `packages/reconciler/src/diff.ts`
- Test: `packages/reconciler/src/__tests__/diff.test.ts`
- Test: `packages/reconciler/src/__tests__/handler.test.ts`
- Modify: `pnpm-workspace.yaml`

- [ ] **Step 1: Write the failing test for `diff`**

```ts
import { describe, it, expect } from 'vitest';
import { diffTargets } from '../diff.js';

describe('diffTargets', () => {
  it('reports targets in DDB but not in Gateway', () => {
    const out = diffTargets({ ddb: ['exa', 'you'], gateway: ['exa'] });
    expect(out.missing).toEqual(['you']);
    expect(out.extra).toEqual([]);
  });

  it('reports targets in Gateway but not in DDB', () => {
    const out = diffTargets({ ddb: ['exa'], gateway: ['exa', 'legacy'] });
    expect(out.missing).toEqual([]);
    expect(out.extra).toEqual(['legacy']);
  });

  it('clean state', () => {
    expect(diffTargets({ ddb: ['exa'], gateway: ['exa'] })).toEqual({ missing: [], extra: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter reconciler test -- diff`
Expected: FAIL — package not found. Add the package to `pnpm-workspace.yaml`.

- [ ] **Step 3: Write minimal implementation**

`packages/reconciler/package.json`:

```json
{
  "name": "reconciler",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "build": "esbuild src/handler.ts --bundle --platform=node --target=node20 --format=esm --outfile=dist/handler.mjs"
  },
  "dependencies": {
    "@search-gateway/shared": "workspace:*",
    "@aws-sdk/client-dynamodb": "^3.600.0",
    "@aws-sdk/util-dynamodb": "^3.600.0"
  },
  "devDependencies": {
    "esbuild": "^0.21.0",
    "vitest": "^1.6.0"
  }
}
```

`src/diff.ts`:

```ts
export interface DiffInput {
  ddb: string[];
  gateway: string[];
}

export interface DiffOutput {
  missing: string[];
  extra: string[];
}

export function diffTargets(input: DiffInput): DiffOutput {
  const ddbSet = new Set(input.ddb);
  const gwSet = new Set(input.gateway);
  return {
    missing: input.ddb.filter((x) => !gwSet.has(x)),
    extra: input.gateway.filter((x) => !ddbSet.has(x))
  };
}
```

- [ ] **Step 4: Write the handler test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { createHandler } from '../handler.js';

describe('reconciler handler', () => {
  it('emits a metric and log entry per drift', async () => {
    const ddb = { send: vi.fn().mockResolvedValue({ Items: [{ providerId: { S: 'exa' }, enabled: { BOOL: true } }] }) };
    const listGatewayTargets = vi.fn().mockResolvedValue(['legacy']);
    const emitMetric = vi.fn();
    const log = { info: vi.fn(), warn: vi.fn() };
    const handler = createHandler({ ddb: ddb as any, configTable: 'C', gatewayId: 'g', listGatewayTargets, emitMetric, log: log as any });
    const out = await handler();
    expect(out.missing).toEqual(['exa']);
    expect(out.extra).toEqual(['legacy']);
    expect(emitMetric).toHaveBeenCalledWith('ReconcilerDrift', 2);
    expect(log.warn).toHaveBeenCalled();
  });

  it('emits ReconcilerDrift=0 on clean state', async () => {
    const ddb = { send: vi.fn().mockResolvedValue({ Items: [{ providerId: { S: 'exa' }, enabled: { BOOL: true } }] }) };
    const listGatewayTargets = vi.fn().mockResolvedValue(['exa']);
    const emitMetric = vi.fn();
    const log = { info: vi.fn(), warn: vi.fn() };
    const handler = createHandler({ ddb: ddb as any, configTable: 'C', gatewayId: 'g', listGatewayTargets, emitMetric, log: log as any });
    await handler();
    expect(emitMetric).toHaveBeenCalledWith('ReconcilerDrift', 0);
  });
});
```

- [ ] **Step 5: Write `handler.ts`**

```ts
import { ScanCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { diffTargets } from './diff.js';

export interface HandlerDeps {
  ddb: DynamoDBClient;
  configTable: string;
  gatewayId: string;
  listGatewayTargets: (gatewayId: string) => Promise<string[]>;
  emitMetric: (name: string, value: number) => void;
  log: { info: (m: string, ctx?: unknown) => void; warn: (m: string, ctx?: unknown) => void };
}

export function createHandler(deps: HandlerDeps) {
  return async function handler() {
    const out = await deps.ddb.send(new ScanCommand({ TableName: deps.configTable }));
    const ddbTools = (out.Items ?? [])
      .map((i) => unmarshall(i) as { providerId: string; enabled: boolean })
      .filter((r) => r.enabled)
      .map((r) => `search_${r.providerId}`);
    const gwTools = await deps.listGatewayTargets(deps.gatewayId);
    const diff = diffTargets({ ddb: ddbTools, gateway: gwTools });
    const total = diff.missing.length + diff.extra.length;
    deps.emitMetric('ReconcilerDrift', total);
    if (total > 0) deps.log.warn('reconciler.drift', diff);
    else deps.log.info('reconciler.clean');
    return diff;
  };
}
```

- [ ] **Step 6: Run all tests**

Run: `pnpm --filter reconciler test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/reconciler/ pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat(reconciler): drift detection between ConfigTable and Gateway"
```

---

### Task 5: Reconciler in CDK on a 15-min EventBridge schedule

**Files:**
- Modify: `infra/lib/stacks/observability-stack.ts`
- Test: `infra/test/observability-stack.test.ts` (extend)

- [ ] **Step 1: Extend the test**

Add to `observability-stack.test.ts`:

```ts
it('schedules the reconciler every 15 minutes and alarms on drift', () => {
  const app = new App();
  const s = new ObservabilityStack(app, 'T', { /* same props */ } as any);
  const t = Template.fromStack(s);
  t.hasResourceProperties('AWS::Events::Rule', { ScheduleExpression: 'rate(15 minutes)' });
  t.hasResourceProperties('AWS::CloudWatch::Alarm', {
    MetricName: 'ReconcilerDrift'
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter infra test -- observability-stack`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

In `observability-stack.ts` add:

```ts
import { Function, Code, Runtime, Architecture } from 'aws-cdk-lib/aws-lambda';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';

const reconciler = new Function(this, 'Reconciler', {
  runtime: Runtime.NODEJS_20_X,
  architecture: Architecture.ARM_64,
  handler: 'handler.handler',
  code: Code.fromAsset('../../packages/reconciler/dist'),
  timeout: Duration.minutes(2),
  environment: {
    CONFIG_TABLE: props.configTableName,
    GATEWAY_ID: props.gatewayId
  }
});

new Rule(this, 'ReconcilerSchedule', {
  schedule: Schedule.rate(Duration.minutes(15)),
  targets: [new LambdaFunction(reconciler)]
});

new Alarm(this, 'A_reconciler_drift', {
  metric: new Metric({ namespace: 'SearchGateway', metricName: 'ReconcilerDrift', statistic: 'Maximum', period: Duration.minutes(15) }),
  evaluationPeriods: 1,
  threshold: 1,
  comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
  alarmName: 'sg-reconciler-drift'
}).addAlarmAction(new SnsAction(topic));
```

Grant: `dynamodb:Scan` on ConfigTable; `bedrock-agentcore:ListGatewayTargets` (or AWS-issued action equivalent — verify against the SDK at implementation time, suppress with a justification if the action name is in flux).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter infra test && pnpm cdk synth`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add infra/lib/stacks/observability-stack.ts infra/test/observability-stack.test.ts
git commit -m "feat(infra): reconciler lambda + 15-min schedule + drift alarm"
```

---

### Task 6: AuditLogTable → S3 (Object Lock) export

**Files:**
- Create: `packages/audit-export/src/handler.ts`
- Test: `packages/audit-export/src/__tests__/handler.test.ts`
- Create: `packages/audit-export/package.json`
- Modify: `infra/lib/stacks/observability-stack.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { createHandler } from '../handler.js';

describe('audit-export handler', () => {
  it('writes one S3 object per stream record (NEW image only)', async () => {
    const s3 = { send: vi.fn().mockResolvedValue({}) };
    const handler = createHandler({ s3: s3 as any, bucket: 'audit-bucket' });
    await handler({
      Records: [
        {
          eventName: 'INSERT',
          dynamodb: {
            NewImage: {
              actor: { S: 'u1' },
              ts: { S: '2026-05-23T10:00:00Z' },
              action: { S: 'reveal_secret' },
              target: { S: 'provider:exa' }
            }
          }
        }
      ]
    } as any);
    expect(s3.send).toHaveBeenCalledTimes(1);
    const args = s3.send.mock.calls[0][0].input;
    expect(args.Bucket).toBe('audit-bucket');
    expect(args.Key).toMatch(/^2026\/05\/23\/u1_/);
    expect(args.ObjectLockMode).toBe('COMPLIANCE');
  });

  it('skips MODIFY/REMOVE (audit rows are immutable)', async () => {
    const s3 = { send: vi.fn() };
    const handler = createHandler({ s3: s3 as any, bucket: 'b' });
    await handler({ Records: [{ eventName: 'MODIFY', dynamodb: {} } as any] } as any);
    expect(s3.send).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter audit-export test`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { DynamoDBStreamHandler } from 'aws-lambda';

export interface HandlerDeps {
  s3: S3Client;
  bucket: string;
  retainUntilDays?: number;
}

export function createHandler(deps: HandlerDeps): DynamoDBStreamHandler {
  return async (event) => {
    const days = deps.retainUntilDays ?? 365 * 7; // 7 years default
    for (const r of event.Records) {
      if (r.eventName !== 'INSERT' || !r.dynamodb?.NewImage) continue;
      const row = unmarshall(r.dynamodb.NewImage as never) as { actor: string; ts: string };
      const date = new Date(row.ts);
      const key = `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}/${row.actor}_${date.getTime()}.json`;
      await deps.s3.send(
        new PutObjectCommand({
          Bucket: deps.bucket,
          Key: key,
          Body: JSON.stringify(row),
          ContentType: 'application/json',
          ObjectLockMode: 'COMPLIANCE',
          ObjectLockRetainUntilDate: new Date(Date.now() + days * 86_400_000)
        })
      );
    }
  };
}
```

In CDK extend the stack:

```ts
import { Bucket, ObjectLockRetention, ObjectLockMode } from 'aws-cdk-lib/aws-s3';
import { StartingPosition } from 'aws-cdk-lib/aws-lambda';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Table } from 'aws-cdk-lib/aws-dynamodb';

const bucket = new Bucket(this, 'AuditExport', {
  objectLockEnabled: true,
  objectLockDefaultRetention: ObjectLockRetention.compliance(Duration.days(7 * 365)),
  encryption: BucketEncryption.S3_MANAGED,
  versioned: true,
  blockPublicAccess: BlockPublicAccess.BLOCK_ALL
});

const auditExport = new Function(this, 'AuditExport', {
  runtime: Runtime.NODEJS_20_X,
  architecture: Architecture.ARM_64,
  handler: 'handler.handler',
  code: Code.fromAsset('../../packages/audit-export/dist'),
  timeout: Duration.seconds(30),
  environment: { BUCKET: bucket.bucketName }
});
bucket.grantPut(auditExport);

const auditTable = Table.fromTableAttributes(this, 'AuditTable', {
  tableName: props.auditTableName,
  tableStreamArn: props.auditTableStreamArn
});
auditExport.addEventSource(
  new DynamoEventSource(auditTable, { startingPosition: StartingPosition.LATEST, batchSize: 100, retryAttempts: 3 })
);
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter audit-export test && pnpm --filter infra test && pnpm cdk synth`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/audit-export/ infra/lib/stacks/observability-stack.ts pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat(observability): audit export to S3 with object lock"
```

---

### Task 7: CloudTrail data events on Secrets / KMS / DynamoDB

**Files:**
- Modify: `infra/lib/stacks/observability-stack.ts`
- Test: `infra/test/observability-stack.test.ts` (extend)

- [ ] **Step 1: Extend the test**

```ts
it('creates a CloudTrail with data events for DDB, KMS, Secrets', () => {
  const app = new App();
  const s = new ObservabilityStack(app, 'T', { /* same props */ } as any);
  const t = Template.fromStack(s);
  t.hasResourceProperties('AWS::CloudTrail::Trail', {
    EventSelectors: Match.arrayWith([
      Match.objectLike({ DataResources: Match.arrayWith([Match.objectLike({ Type: 'AWS::DynamoDB::Table' })]) })
    ])
  });
});
```

(import `Match` from `aws-cdk-lib/assertions`)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter infra test -- observability-stack`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
import { Trail, ReadWriteType, DataResourceType } from 'aws-cdk-lib/aws-cloudtrail';
import { Bucket as TrailBucket } from 'aws-cdk-lib/aws-s3';

const trailBucket = new TrailBucket(this, 'TrailBucket', { encryption: BucketEncryption.S3_MANAGED, versioned: true, blockPublicAccess: BlockPublicAccess.BLOCK_ALL });
const trail = new Trail(this, 'Trail', { bucket: trailBucket, isMultiRegionTrail: false });
trail.addEventSelector(DataResourceType.DYNAMO_DB_TABLE, [`${props.auditTableArn}/*`, `arn:aws:dynamodb:${this.region}:${this.account}:table/${props.configTableName}/*`], { readWriteType: ReadWriteType.ALL });
trail.logAllS3DataEvents(); // covers audit-export bucket reads if anyone tries
trail.addEventSelector(DataResourceType.LAMBDA_FUNCTION, ['arn:aws:lambda:*:*:function:*search-router*']);
```

KMS and Secrets data events are logged via `addEventSelector` with `Type: 'AWS::KMS::Key'` and `'AWS::SecretsManager::Secret'` — use the explicit object form because `DataResourceType` doesn't include them as enums. This requires writing to the `eventSelectors` property directly on the underlying `CfnTrail`. Document this in a code comment.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter infra test && pnpm cdk synth`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add infra/lib/stacks/observability-stack.ts infra/test/observability-stack.test.ts
git commit -m "feat(observability): cloudtrail data events for ddb, kms, secrets, lambda"
```

---

### Task 8: Per-call audit hooks in admin-bff routes

**Files:**
- Modify: `packages/admin-console/src/handlers/test-provider.ts` (add audit row)
- Modify: `packages/admin-console/src/handlers/get-metrics.ts` — no audit (read-only)
- Modify: tests for both

- [ ] **Step 1: Decide which routes audit**

Audit-on: `update_provider`, `put_secret`, `reveal_secret`, `test_provider` (because admin-bff Task 14 explicitly excluded `test_provider` — re-decide here so the audit log is complete for security-hardening).
Audit-off: `list_providers`, `get_metrics`, `list_audit` (read-only).

- [ ] **Step 2: Update `test-provider.ts` to write an audit row**

Mirror the pattern from `update-provider.ts` — accept `ddb`, `auditTable`, `actor`, write `action: 'test_provider'` with a `before/after` summarizing the result. Update the existing test to assert `ddb.send` was called once (audit) plus the Lambda invoke.

- [ ] **Step 3: Run tests**

Run: `pnpm --filter admin-console test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/admin-console/src/handlers/test-provider.ts packages/admin-console/src/handlers/__tests__/test-provider.test.ts
git commit -m "feat(admin-console): audit row on test_provider"
```

---

### Task 9: Deploy + force every alarm to ALARM at least once

**Files:**
- Create: `scripts/ops/force-alarms.sh`

- [ ] **Step 1: Add the script**

`scripts/ops/force-alarms.sh` lists every CloudWatch alarm starting with `sg-` and runs `aws cloudwatch set-alarm-state --state-value ALARM --state-reason "ops-test"` against each, then waits 30 s and sets them back to `OK`.

- [ ] **Step 2: Deploy**

Run: `pnpm cdk deploy --all --context env=dev`
Expected: clean.

- [ ] **Step 3: Force the alarms**

Run: `scripts/ops/force-alarms.sh`
Expected: every alarm transitions ALARM → OK and the SNS topic receives a notification per alarm.

- [ ] **Step 4: Verify dashboard populates**

Run a few loads against the dev MCP endpoint (`scripts/mcp-call.sh search_unified ...` 20 times) and check the CloudWatch dashboard widgets show non-empty data.

- [ ] **Step 5: Commit**

```bash
git add scripts/ops/force-alarms.sh
git commit -m "chore(ops): script to force every alarm to ALARM for verification"
```

---

### Task 10: Verify Reconciler drift detection end-to-end

**Files:** none

- [ ] **Step 1: Induce drift**

In dev: `aws dynamodb update-item` on ConfigTable to set `enabled: true` for a provider that has not yet been registered as a Gateway target (or vice versa).

- [ ] **Step 2: Wait for the next 15-min Reconciler run**

Wait up to 15 min, then check CloudWatch Logs for the Reconciler Lambda — expect a `reconciler.drift` warn entry listing the missing/extra tools.

- [ ] **Step 3: Verify the alarm fires**

Expect `sg-reconciler-drift` to transition to ALARM.

- [ ] **Step 4: Roll back**

Revert the ConfigTable change. Wait 15 min. Confirm `reconciler.clean` log + alarm back to OK.

---

### Task 11: Verify audit S3 export is immutable

**Files:** none

- [ ] **Step 1: Trigger an audit row**

Run the `admin-bff` `walkthrough.sh` once.

- [ ] **Step 2: Inspect S3**

Run: `aws s3 ls s3://<audit-bucket>/$(date -u +%Y/%m/%d)/`
Expected: at least one JSON object per audited action.

- [ ] **Step 3: Confirm Object Lock**

Run: `aws s3api get-object-retention --bucket <audit-bucket> --key <some-key>`
Expected: `Mode: COMPLIANCE` and `RetainUntilDate` ~7 years out.

- [ ] **Step 4: Confirm immutability**

Run: `aws s3api delete-object --bucket <audit-bucket> --key <some-key>`
Expected: error (delete-marker created on a versioned bucket but the underlying version is locked; verify by `aws s3api get-object --bucket … --key … --version-id …`).

---

## Acceptance (mirrors spec §11.2.5)

1. Dashboard widgets populate from real EMF metrics in a dev stack (Tasks 1, 3, 9).
2. Each alarm has been forced to ALARM at least once (synthetic fault) and rolled back to OK (Tasks 2, 3, 9).
3. Reconciler diff log entry appears when ConfigTable and the Gateway are deliberately desynced (Tasks 4, 5, 10).
4. AuditLogTable export to S3 is visible and immutable (Tasks 6, 11).
