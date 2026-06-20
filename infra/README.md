# Web Search Tool Gateway — Terraform IaC

Terraform configuration for AWS AgentCore Gateway + Identity Providers + Lambda tools for multi-engine web search integration.

## Prerequisites

- AWS Account with AgentCore preview access (us-east-1)
- Terraform >= 1.11.0
- AWS CLI v2 with `bedrock-agentcore-control` plugin
- Python 3.12 (for Lambda build)
- API keys for enabled search engines (Tavily, Brave, Serper, Exa, Perplexity)

## Quick Start

### 1. Bootstrap State Bucket

```bash
cd infra
./scripts/deploy.sh bootstrap
```

This creates the state bucket and lock table. The bucket name embeds your
account ID, so the backend block in `environments/dev/backend.tf` is left
empty on purpose — the settings are injected at init time via
`-backend-config` (handled automatically by `./scripts/deploy.sh init`),
keeping the account-specific bucket name out of version control.

### 2. Configure Variables

```bash
cp environments/dev/terraform.tfvars.example environments/dev/terraform.tfvars
# Edit terraform.tfvars with your API keys and preferences
```

Key variables:
- `enable_tavily` / `tavily_api_key`: Tavily search (MCP server target)
- `enable_brave` / `brave_api_key`: Brave search (MCP server target)
- `enable_serper` / `serper_api_key`: Serper search (Lambda target)
- `enable_exa` / `exa_api_key`: Exa neural search (Lambda target)
- `enable_duckduckgo`: DuckDuckGo (Lambda, no key required)
- `enable_perplexity` / `perplexity_api_key`: Perplexity Sonar (Lambda target)
- `auth_mode`: `cognito` (default) or `external_oidc`

### 3. Initialize & Deploy

```bash
./scripts/deploy.sh init
./scripts/deploy.sh plan  # review changes
./scripts/deploy.sh apply # deploy
```

Outputs:
- `gateway_url`: AgentCore Gateway HTTPS endpoint
- `gateway_id`: Gateway identifier
- `cognito_user_pool_id`: Cognito User Pool for authentication
- `cognito_domain`: Cognito auth domain
- `enabled_engines`: List of active search tools

### 4. Seed API Keys

```bash
./scripts/seed-api-keys.sh
```

Populates API keys into AgentCore Identity credential providers.

### 5. Post-apply: managed connectors & evaluators (not Terraform-managed)

Two AgentCore resources are created **out-of-band by scripts, not Terraform**, and
must be run after `apply`. Both rely on recent AgentCore control-plane APIs that the
Terraform AWS provider does not yet expose, and the system `botocore` is too old to
know them — so each script needs a fresh boto3 (run it with `PYTHON=` pointing at a
venv where you've `pip install -U boto3 botocore`). us-east-1 only.

```bash
# 5a. Managed Web Search connector target (the `agentcore` engine).
#     Grants nothing new in TF — the gateway role's InvokeWebSearch permission is
#     created by Terraform when enable_web_search=true; this attaches the target.
./scripts/create-web-search-target.sh

# 5b. Search-quality LLM-as-a-judge evaluators (relevance + authority) used by the
#     dashboard playground's quality card. Rubrics live in infra/evaluators/*.json.
PYTHON=/path/to/venv/bin/python ./scripts/create-evaluators.sh

# 5c. (Demo) Inference target: route a Bedrock model through the gateway as an
#     LLM-routing target. Gated on enable_inference_target=true; the gateway role's
#     bedrock:InvokeModel permission is created by Terraform when that flag is set,
#     and this script attaches the target. Same out-of-band reason as 5a (the
#     provider can't express inference/connector targets yet). us-east-1 only.
PYTHON=/path/to/venv/bin/python ./scripts/create-inference-target.sh
```

> **5c is demoware** illustrating the "LLM Gateway" lens — one Bedrock model behind
> the gateway. The connector `targetConfiguration` shape is recent; the script
> introspects the installed botocore model and exits with upgrade guidance if it's
> too old, so an outdated SDK fails cleanly rather than sending a malformed request.

`create-evaluators.sh` is **idempotent**: it skips an evaluator whose name already
exists. Because `create_evaluator` is **immutable**, changing a rubric in
`infra/evaluators/*.json` means bumping the version suffix in the script's evaluator
names (e.g. `search_relevance_v2` → `_v3`) so a fresh evaluator is created, then
swapping the printed ids into the dashboard env (step 6). Delete superseded
evaluators manually via `delete_evaluator` once the new ones are wired up.

### 6. Dashboard & Cowork Setup

Generate `.env.local` for Next.js dashboard:

```bash
cd ../dashboard
terraform output -json -chdir=../infra/environments/dev | jq -r '.dashboard_env.value | to_entries[] | "\(.key)=\(.value)"' > .env.local
pnpm dev
```

If you ran step 5b, set the evaluator ids it printed in `.env.local` so the
playground quality card can call them (these are not in Terraform outputs):

```
JUDGE_RELEVANCE_EVALUATOR_ID=search_relevance_v2-XXXXXXXX
JUDGE_AUTHORITY_EVALUATOR_ID=search_authority_v2-XXXXXXXX
```

`dashboard/gen-env.sh` preserves existing `JUDGE_*` values on regeneration, so this
only needs doing once per evaluator version. Restart the dev server after editing.

Set up Cowork client (macOS/Windows):

```bash
cd ../cowork
./setup-mac.sh      # or setup-windows.ps1
```

## Directory Structure

```
infra/
├── bootstrap/              # S3 state bucket + DynamoDB lock table
├── environments/dev/       # Development environment (main entry point)
│   ├── main.tf             # Module composition
│   ├── variables.tf        # Input variables (engine toggles, auth mode, etc.)
│   ├── outputs.tf          # Gateway URL, IDs, credentials
│   ├── versions.tf         # Provider versions
│   ├── backend.tf          # S3 backend config
│   ├── terraform.tfvars    # Variable values (git-ignored)
│   └── terraform.tfvars.example
├── modules/
│   ├── auth/               # Cognito User Pool + clients (app, web, m2m)
│   ├── identity-providers/ # AgentCore API-key credential providers
│   ├── gateway/            # AgentCore Gateway (CUSTOM_JWT, MCP protocol)
│   ├── gateway-lambda-tool/ # Lambda function packaging + IAM
│   ├── gateway-mcp-target/ # External MCP server target config
│   └── observability/      # CloudWatch Logs + Vended Logs + Transaction Search
├── evaluators/             # LLM-as-a-judge rubrics (relevance.json, authority.json)
├── scripts/
│   ├── deploy.sh           # Orchestrate bootstrap → init → plan → apply
│   ├── seed-api-keys.sh    # Populate Identity providers with API keys
│   ├── create-web-search-target.sh  # Post-apply: managed Web Search connector (not TF)
│   ├── create-inference-target.sh   # Post-apply (demo): Bedrock LLM-routing target (not TF)
│   ├── create-evaluators.sh         # Post-apply: search-quality evaluators (not TF)
│   └── destroy.sh          # Destroy infrastructure
└── README.md (this file)
```

## Modules

### auth
Cognito User Pool with:
- Resource Server (agentcore/invoke scope)
- App Client (M2M, client_credentials flow)
- Web Client (browser SPA, code flow with PKCE)
- M2M Client (service-to-service)

**Outputs:** user_pool_id, domain, issuer_url, app_client_id, web_client_id, m2m_client_id

### identity-providers
AgentCore API-key credential providers (one per enabled search engine):
- tavily, brave, serper, exa, perplexity

Created empty; API keys seeded by `seed-api-keys.sh`.

**Outputs:** credential_provider_arns (map of engine → ARN)

### gateway
AgentCore Gateway with:
- CUSTOM_JWT authorizer (Cognito OIDC discovery)
- MCP protocol support
- Lambda targets (one per enabled engine)
- MCP server targets (external Tavily, Brave if enabled)
- CloudWatch Transaction Search logs

**Inputs:** cognito_issuer_url, cognito_allowed_clients, lambda_tool_arns, mcp_server_targets
**Outputs:** gateway_id, gateway_url, gateway_arn, gateway_role_arn

### gateway-lambda-tool
Packages and deploys Lambda function for a search tool:
- Builds Python handler + dependencies into ZIP
- Creates IAM role with bedrock-agentcore:GetResourceApiKey permission
- Injects WORKLOAD_TOKEN + IDENTITY_PROVIDER_ARN env vars
- CloudWatch Logs with 7-day retention

Used for_each for each enabled Lambda tool (serper, exa, duckduckgo, perplexity).

**Inputs:** tool_name, source_root, env_vars
**Outputs:** function_arn, function_name

### gateway-mcp-target
Minimal module that prepares external MCP server configuration for gateway registration.
(Actual target registration happens in gateway module.)

**Inputs:** mcp_server_targets (endpoint → credential provider mapping)
**Outputs:** mcp_server_endpoints, mcp_server_credentials

### observability
CloudWatch setup:
- Log group `/aws/vendedlogs/bedrock-agentcore/gateway/APPLICATION_LOGS/{gateway_id}` (30-day retention)
- Resource policy allowing AgentCore to write logs
- Vended logs enablement (via bedrock-agentcore-control CLI, or manual console)
- OTEL spans ingestion for Transaction Search
- Traces log group for structured tracing

**Inputs:** gateway_id, gateway_arn, enable_otlp_export, otlp_endpoint
**Outputs:** log_group_name, traces_log_group_name

## Deployment Workflow

### Full deployment

```bash
cd infra/environments/dev
terraform init -backend-config=... # from bootstrap
terraform plan -out=tfplan
terraform apply tfplan
```

### Incremental changes

```bash
# Enable a new search engine
echo 'enable_serper = true' >> terraform.tfvars
echo 'serper_api_key = "your-key"' >> terraform.tfvars
terraform plan
terraform apply
```

### Destroy

```bash
./scripts/destroy.sh
# Manually delete S3 state bucket (contains tfstate files)
aws s3 rb s3://websearch-gw-tfstate-<account>-us-east-1 --force
```

## Environment Separation

Currently deployed to `environments/dev`. To add staging/prod:

```bash
mkdir -p environments/staging
cp -r environments/dev/* environments/staging/
# Edit staging/terraform.tfvars with staging-specific values
terraform -chdir=environments/staging apply
```

## Troubleshooting

### "bedrock-agentcore-control not found"
Vended logs enablement requires the AWS CLI plugin. Manual workaround:
1. After `terraform apply` completes, go to AWS Console
2. Navigate to AgentCore Gateway → Logging
3. Enable Application Logs → CloudWatch Logs
4. Set log group to `/aws/vendedlogs/bedrock-agentcore/gateway/APPLICATION_LOGS/{gateway_id}`

### Lambda build fails
Ensure Python 3.12 + pip3 available on path:
```bash
python3.12 --version
pip3 install --upgrade pip
```

### Terraform state lock timeout
Check DynamoDB `websearch-gw-tfstate-lock` table for stale locks:
```bash
aws dynamodb scan --table-name websearch-gw-tfstate-lock
# Manual unlock: delete the stuck lock item
```

### MCP Gateway target fails to register
Ensure:
1. External MCP server (Tavily, Brave) endpoint is reachable
2. Credential provider ARN is correct (output from identity-providers module)
3. Gateway role has bedrock-agentcore:GetResourceApiKey permission

## Security Best Practices

- **Terraform state:** Stored in S3 with SSE-AES256 + versioning + public access block
- **API keys:** Use Terraform `sensitive = true` in tfvars; never commit actual keys
- **IAM:** Gateway role limited to lambda:InvokeFunction + bedrock-agentcore:GetResourceApiKey
- **Logs:** 30-day retention; optionally export to external OTLP backend
- **Policies:** Optional rate-limit + allowlist engines for additional protection

## Costs

Typical dev environment:
- **AgentCore Gateway:** ~$0.01–0.05/day (depends on invocations)
- **Lambda:** ~$0.001–0.01/day (depends on tool usage)
- **CloudWatch Logs:** ~$0.50–2/month (10–100 GB ingested)
- **Cognito:** Free tier covers dashboard + cowork usage
- **External APIs:** Tavily ($10–100/mo), Brave (free tier), Serper ($0–100/mo), Exa ($0–200/mo), Perplexity ($20–200/mo)

## Next Steps

1. **Verify Gateway:** `curl -H "Authorization: Bearer $JWT" $GATEWAY_URL/.well-known/mcp.json`
2. **Test Lambda:** `aws lambda invoke --function-name websearch-gw-dev-tool-serper /dev/stdout`
3. **Dashboard:** `cd ../dashboard && pnpm dev`
4. **Cowork:** `cd ../cowork && ./setup-mac.sh` (or Windows equivalent)
5. **Access:** Review gateway authorizer + allowed clients via `/access` dashboard page

## References

- [AWS AgentCore Documentation](https://docs.aws.amazon.com/agentcore/)
- [AgentCore Gateway API](https://docs.aws.amazon.com/agentcore/latest/userguide/gateway.html)
- [MCP Protocol](https://modelcontextprotocol.io/)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
