# CDK-NAG Baseline — v1.0 (2026-05-24)

## Current Suppressions

This document captures the baseline cdk-nag suppressions that are active in `infra/lib/nag-suppressions.ts` as of the v1.0 walking skeleton release.

| Finding ID | Resource(s) | Subsystem | Reason | Plan Action |
|---|---|---|---|---|
| `AwsSolutions-IAM4` | `AwsCustomResource` (CreateGateway, CreateTarget) | gateway | AWS-managed policies on AwsCustomResource Lambdas; scoped to control-plane API actions | Task 2: Replace with inline policies |
| `AwsSolutions-IAM5` | search-router (cloudwatch:PutMetricData), AwsCustomResource (bedrock-agentcore:Create*/Delete*) | compute, gateway | CloudWatch:PutMetricData and bedrock-agentcore:Create*/Delete* use resource:* by API contract | Task 3: Scope with conditions and resource ARNs |
| `AwsSolutions-VPC7` | VPC FlowLog (CloudWatch only) | network | VPC flow logs enabled to CloudWatch; S3 destination missing | Task 4: Add S3 destination |
| `AwsSolutions-L1` | All Lambda functions (Runtime.NODEJS_20_X) | compute, gateway | Node 20 is explicit v1 runtime target; bedrock-agentcore-control SDK does not yet support nodejs22 | Task 5: Bump to NODEJS_22_X or per-resource suppression |
| `AwsSolutions-SNS3` | SNS alarm topic | observability | SNS topic is internal alarm fan-out only; encryption-in-transit and SSL enforcement missing | Task 6: Add SSL policy and KMS encryption |
| `AwsSolutions-DDB3` | QuotaTable | data | QuotaTable holds ephemeral counters with TTL; PITR unnecessary | Task 7: Move to per-resource suppression with strengthened reason |

## Verification

Run: `pnpm cdk synth --strict` from `infra/` directory.

Expected outcome: All suppressions are stack-level in `applyV1NagSuppressions()`.

## Next Steps

1. Task 2: Inline IAM policies on AwsCustomResource (drop IAM4)
2. Task 3: Scope IAM5 wildcards with conditions (drop IAM5)
3. Task 4: Add S3 flow log destination (drop VPC7)
4. Task 5: Bump Lambda runtime or per-resource L1 suppression
5. Task 6: SSL-only SNS topic + KMS encryption (drop SNS3)
6. Task 7: Per-resource DDB3 suppression (move from stack-level)
7. Task 8: STRIDE threat model
8. Task 9: GuardDuty / SecurityHub stack props
9. Task 10: Final nag-suppressions cleanup
