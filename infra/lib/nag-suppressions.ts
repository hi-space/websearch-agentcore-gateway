import { NagSuppressions } from 'cdk-nag';
import { Stack } from 'aws-cdk-lib';

export function applyV1NagSuppressions(stack: Stack): void {
  NagSuppressions.addStackSuppressions(stack, [
    {
      id: 'AwsSolutions-IAM4',
      reason: 'AWS-managed AWSLambdaBasicExecutionRole / AWSLambdaVPCAccessExecutionRole are auto-attached by L2 NodejsFunction and AwsCustomResource constructs. AwsCustomResource is used for ConfigSeed, AgentCore Gateway/Target creation; the singleton provider Lambda manages its own role and policies are scoped via AwsCustomResourcePolicy.fromStatements. Tightening the auto-attached defaults requires bypassing CDK L2s and is deferred to v1.6 once a CFN-native AgentCore L1 ships.'
    },
    {
      id: 'AwsSolutions-IAM5',
      reason: 'CloudWatch:PutMetricData and bedrock-agentcore:Create*/Delete* require resource:* by API contract; bounded by namespace/action conditions where possible.'
    },
    // AwsSolutions-DDB3: scoped per-resource on the three tables that opt out of PITR
    // (QuotaTable, MfaReplayTable — ephemeral; AuditLogTable — WORM via S3 Object Lock).
    // Stack-level suppression removed in v1.6 hardening.
    {
      id: 'AwsSolutions-L1',
      reason: 'Node 20 is the explicit v1 runtime target (set in NodejsFunction and AwsCustomResource defaults). Bedrock-agentcore-control SDK does not yet support nodejs22; revisit and bump to latest LTS in v1.6.'
    },
    {
      id: 'AwsSolutions-CFR1',
      reason: 'Admin Console is internal-only for v1 walking skeleton; geo-restrictions will be enforced with CloudFront policies and WAF rules in v1.5+'
    },
    {
      id: 'AwsSolutions-CFR3',
      reason: 'CloudFront access logging is deferred to v1.5 when centralized observability stack is deployed.'
    },
    {
      id: 'AwsSolutions-CFR4',
      reason: 'CloudFront default viewer certificate enforces TLSv1.2+; custom certificate and explicit MinimumProtocolVersion are deferred to v1.5 when custom domain is configured.'
    },
    {
      id: 'AwsSolutions-ELB2',
      reason: 'SearXNG internal ALB is for internal VPC communication only; access logs are unnecessary for internal-only services and deferred to v1.5 observability stack.'
    },
    {
      id: 'AwsSolutions-EC23',
      reason: 'SearXNG ALB security group allows inbound from VPC CIDR only; public 0.0.0.0/0 access is restricted by ALB being internal-only.'
    },
    {
      id: 'AwsSolutions-COG8',
      reason: 'Cognito Plus tier (advanced threat protection) is a paid feature deferred to v1.6 once cost model is approved; v1 admin pool enforces MFA, 12-char password policy, and rate-limited Lambda authorizer.'
    },
    {
      id: 'AwsSolutions-SF1',
      reason: 'CDK-managed waiter state machine inside cr.Provider polls AgentCore Gateway READY status; CloudWatch Logs ALL events would log every poll iteration and inflate retention costs. The waiter is short-lived (10 min max) and is observed via the parent custom resource. Will revisit when CFN-native AgentCore L1 obviates the polling provider in v1.6.'
    },
    {
      id: 'AwsSolutions-SF2',
      reason: 'CDK-managed waiter state machine inside cr.Provider does not need X-Ray tracing in v1; provider is invoked only during stack create/update, not request-path. Will revisit when CFN-native AgentCore L1 obviates the polling provider in v1.6.'
    }
  ]);
}
