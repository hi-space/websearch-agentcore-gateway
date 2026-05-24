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
});
