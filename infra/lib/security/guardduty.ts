import { Construct } from 'constructs';
import { CfnDetector } from 'aws-cdk-lib/aws-guardduty';

/**
 * Enable GuardDuty for threat detection and monitoring.
 * GuardDuty analyzes CloudTrail logs, VPC Flow Logs, and DNS logs to identify
 * unauthorized or anomalous activity.
 */
export function enableGuardDuty(scope: Construct): void {
  new CfnDetector(scope, 'GuardDuty', {
    enable: true,
    findingPublishingFrequency: 'FIFTEEN_MINUTES'
  });
}
