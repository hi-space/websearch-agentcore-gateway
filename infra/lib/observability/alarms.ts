import { Construct } from 'constructs';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { Alarm, ComparisonOperator, Metric, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Duration } from 'aws-cdk-lib';

export class AlarmsConstruct extends Construct {
  readonly topic: Topic;

  constructor(scope: Construct, id: string) {
    super(scope, id);
    this.topic = new Topic(this, 'Topic', { displayName: 'search-gateway-alerts' });

    const errorMetric = new Metric({
      namespace: 'SearchGateway',
      metricName: 'Errors',
      statistic: 'Sum',
      period: Duration.minutes(5),
      dimensionsMap: { Provider: 'arxiv', Status: 'UPSTREAM_ERROR' }
    });
    const alarm = new Alarm(this, 'ArxivUpstreamErrors', {
      metric: errorMetric,
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
      alarmDescription: 'arXiv upstream errors exceeded threshold'
    });
    alarm.addAlarmAction(new SnsAction(this.topic));
  }
}
