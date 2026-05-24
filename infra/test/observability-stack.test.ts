import { Template, Match } from 'aws-cdk-lib/assertions';
import { App } from 'aws-cdk-lib';
import { describe, it, expect } from 'vitest';
import { ObservabilityStack } from '../lib/stacks/observability-stack.js';

const baseProps = {
  env: { account: '111', region: 'us-east-1' },
  providers: ['exa', 'tavily'],
  snsTopicArn: 'arn:aws:sns:us-east-1:111:t',
  auditTableName: 'AuditLogTable',
  auditTableStreamArn: 'arn:aws:dynamodb:us-east-1:111:table/AuditLogTable/stream/2026',
  auditTableArn: 'arn:aws:dynamodb:us-east-1:111:table/AuditLogTable',
  configTableName: 'ConfigTable',
  gatewayId: 'gw-123'
};

describe('ObservabilityStack', () => {
  it('creates dashboard + alarm per definition', () => {
    const app = new App();
    const s = new ObservabilityStack(app, 'T', baseProps as any);
    const t = Template.fromStack(s);
    t.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
    // 4 per provider × 2 providers + 2 admin + 1 reconciler = 11
    const alarms = t.findResources('AWS::CloudWatch::Alarm');
    expect(Object.keys(alarms)).toHaveLength(11);
  });

  it('schedules the reconciler every 15 minutes and alarms on drift', () => {
    const app = new App();
    const s = new ObservabilityStack(app, 'T', baseProps as any);
    const t = Template.fromStack(s);
    t.hasResourceProperties('AWS::Events::Rule', { ScheduleExpression: 'rate(15 minutes)' });
    t.hasResourceProperties('AWS::CloudWatch::Alarm', {
      MetricName: 'ReconcilerDrift'
    });
  });

  it('creates a CloudTrail with management events + Lambda data events', () => {
    // KMS Decrypt/Encrypt + SecretsManager GetSecretValue are emitted as
    // management events, so the Management selector covers them. Lambda
    // data events on search-router are added explicitly.
    const app = new App();
    const s = new ObservabilityStack(app, 'T', baseProps as any);
    const t = Template.fromStack(s);
    t.resourceCountIs('AWS::CloudTrail::Trail', 1);
    const trails = t.findResources('AWS::CloudTrail::Trail');
    const trail = Object.values(trails)[0] as {
      Properties: { AdvancedEventSelectors?: Array<{ Name?: string; FieldSelectors: Array<{ Field: string; Equals?: string[]; StartsWith?: string[] }> }> }
    };
    const selectors = trail.Properties.AdvancedEventSelectors ?? [];
    expect(selectors.length).toBeGreaterThanOrEqual(2);
    const categories = selectors.flatMap((sel) =>
      sel.FieldSelectors.filter((f) => f.Field === 'eventCategory').flatMap((f) => f.Equals ?? [])
    );
    expect(categories).toContain('Management');
    expect(categories).toContain('Data');
    const resourceTypes = selectors.flatMap((sel) =>
      sel.FieldSelectors.filter((f) => f.Field === 'resources.type').flatMap((f) => f.Equals ?? [])
    );
    expect(resourceTypes).toContain('AWS::Lambda::Function');
  });
});
