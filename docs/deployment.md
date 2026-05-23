# Deployment (v1.0 walking skeleton)

## Prerequisites
- Node 20, pnpm 9, AWS CDK v2.140+, AWS credentials with
  CloudFormation/IAM/VPC/Lambda/DynamoDB/KMS/SNS/bedrock-agentcore privileges.
- AgentCore Gateway available in your target region.

## Bootstrap and deploy
```bash
pnpm install
pnpm -r build
pnpm --filter infra exec -- cdk bootstrap
pnpm deploy
```

The stack outputs `GatewayId`. Configure your MCP client with the Gateway
endpoint shown in the AgentCore console. The only tool exposed in v1.0 is
`search_arxiv`. Quota defaults: 30 rpm, 1000/day.

## Smoke test
```bash
# Replace <gateway-id> with the CfnOutput value
aws bedrock-agentcore-control list-tools \
  --gateway-identifier <gateway-id>
```

You should see `search_arxiv` listed. Connect an MCP client and call it
with `{ "query": "quantum computing" }`. Expect a JSON object with
`results` of length up to 10.

## Teardown
```bash
pnpm --filter infra exec -- cdk destroy
```
KMS keys and Config table use `RETAIN` removal policy by design.
