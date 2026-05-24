import { Stack, type StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Dashboard, Alarm, Metric, ComparisonOperator } from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { Function, Code, Runtime, Architecture } from 'aws-cdk-lib/aws-lambda';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildDashboardBody } from '../observability/dashboard-spec.js';
import { listAlarmDefinitions } from '../observability/alarm-spec.js';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');

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
      const a = new Alarm(this, `A_${def.id.replace(/\./g, '_')}`, {
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

    // Task 5: Reconciler Lambda on 15-min schedule
    const reconcilerDistPath = resolve(__dirname, '../../packages/reconciler/dist');
    const reconcilerCode = existsSync(reconcilerDistPath)
      ? Code.fromAsset(reconcilerDistPath)
      : Code.fromInline('exports.handler=async()=>{};');

    const reconciler = new Function(this, 'Reconciler', {
      runtime: Runtime.NODEJS_20_X,
      architecture: Architecture.ARM_64,
      handler: 'handler.handler',
      code: reconcilerCode,
      timeout: Duration.minutes(2),
      environment: {
        CONFIG_TABLE: props.configTableName,
        GATEWAY_ID: props.gatewayId
      }
    });

    // Grant DynamoDB Scan on ConfigTable
    reconciler.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['dynamodb:Scan'],
        resources: [props.auditTableArn.replace(/table\/.*/, `table/${props.configTableName}`)]
      })
    );

    // Grant bedrock-agentcore ListGatewayTargets (suppress if action name is in flux)
    reconciler.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['bedrock-agentcore:ListGatewayTargets'],
        resources: ['*']
      })
    );

    // Grant CloudWatch metrics
    reconciler.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*']
      })
    );

    // Grant CloudWatch Logs
    reconciler.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: ['arn:aws:logs:*:*:*']
      })
    );

    new Rule(this, 'ReconcilerSchedule', {
      schedule: Schedule.rate(Duration.minutes(15)),
      targets: [new LambdaFunction(reconciler)]
    });

    new Alarm(this, 'A_reconciler_drift', {
      metric: new Metric({
        namespace: 'SearchGateway',
        metricName: 'ReconcilerDrift',
        statistic: 'Maximum',
        period: Duration.minutes(15)
      }),
      evaluationPeriods: 1,
      threshold: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      alarmName: 'sg-reconciler-drift'
    }).addAlarmAction(new SnsAction(topic));

    // remaining tasks (6–7) attach more constructs to this stack
  }
}
