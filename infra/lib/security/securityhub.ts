import { Construct } from 'constructs';
import { CfnHub } from 'aws-cdk-lib/aws-securityhub';

/**
 * Enable AWS Security Hub for centralized security findings and compliance checks.
 * Security Hub aggregates findings from GuardDuty, Inspector, Config, and other
 * AWS services, plus third-party security tools.
 */
export function enableSecurityHub(scope: Construct): void {
  new CfnHub(scope, 'SecurityHub', {});
}
