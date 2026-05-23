import { NagSuppressions } from 'cdk-nag';
import { Stack } from 'aws-cdk-lib';

export function applyV1NagSuppressions(stack: Stack): void {
  NagSuppressions.addStackSuppressions(stack, [
    {
      id: 'AwsSolutions-IAM4',
      reason: 'AWS-managed policies on AwsCustomResource Lambdas are scoped to control-plane API actions only; tightened in v1.6 once a CFN-native AgentCore L1 ships.'
    },
    {
      id: 'AwsSolutions-IAM5',
      reason: 'CloudWatch:PutMetricData and bedrock-agentcore:Create*/Delete* require resource:* by API contract; bounded by namespace/action conditions where possible.'
    },
    {
      id: 'AwsSolutions-VPC7',
      reason: 'VPC flow logs are enabled to CloudWatch; S3 destination is added with audit bucket in v1.5.'
    },
    {
      id: 'AwsSolutions-L1',
      reason: 'Node 20 is the explicit v1 runtime target (set in NodejsFunction and AwsCustomResource defaults). Bedrock-agentcore-control SDK does not yet support nodejs22; revisit and bump to latest LTS in v1.6.'
    },
    {
      id: 'AwsSolutions-SNS3',
      reason: 'SNS topic is internal alarm fan-out only; encryption-in-transit (HTTPS) and topic-policy SSL enforcement land alongside KMS topic encryption in v1.5 when the audit/observability stack hardens.'
    },
    {
      id: 'AwsSolutions-DDB3',
      reason: 'QuotaTable holds ephemeral RPM/daily counters with TTL and RemovalPolicy.DESTROY; PITR is unnecessary cost. ConfigTable (durable) already has PITR enabled.'
    }
  ]);
}
