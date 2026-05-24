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
    // remaining tasks (4–7) attach more constructs to this stack
  }
}
