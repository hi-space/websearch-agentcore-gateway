#!/bin/bash
set -e

# ============================================================
# Create the AgentCore Web Search Tool connector gateway target
# ============================================================
# Usage:
#   ./scripts/create-web-search-target.sh
#
# The AWS Terraform provider can't express the "connector" gateway target type
# yet (aws_bedrockagentcore_gateway_target supports only lambda/mcp_server/
# api_gateway/open_api_schema/smithy_model), so the Web Search Tool target is
# created here via the bedrock-agentcore-control API — mirroring
# scripts/seed-api-keys.sh.
#
# The connector target shape is recent, so it needs a current botocore. The
# system `aws` CLI bundles an older model that rejects "connector"; this script
# therefore calls the API through boto3 and verifies the SDK is new enough,
# printing remediation if not.
#
# Idempotent: skips creation if a target named "web-search" already exists.
# Gated on enable_web_search in terraform.tfvars. us-east-1 only.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
INFRA_DIR="$( dirname "$SCRIPT_DIR" )"
DEV_DIR="$INFRA_DIR/environments/dev"

if [ ! -f "$DEV_DIR/terraform.tfvars" ]; then
  echo "ERROR: terraform.tfvars not found"
  exit 1
fi

get_tfvar() {
  grep "^$1" "$DEV_DIR/terraform.tfvars" | cut -d'=' -f2 | xargs | tr -d '"' 2>/dev/null || echo ""
}

AWS_REGION=$(get_tfvar "aws_region")
ENABLE_WEB_SEARCH=$(get_tfvar "enable_web_search")

echo "=========================================="
echo "Web Search Tool gateway target"
echo "=========================================="
echo "Region: $AWS_REGION"
echo ""

if [ "$ENABLE_WEB_SEARCH" != "true" ]; then
  echo "  ⚠ enable_web_search is not true — skipping."
  exit 0
fi

# Web Search Tool is us-east-1 only.
if [ "$AWS_REGION" != "us-east-1" ]; then
  echo "  ✗ Web Search Tool is only available in us-east-1 (got '$AWS_REGION'). Aborting."
  exit 1
fi

# Gateway ID comes from terraform outputs.
GATEWAY_ID=$(cd "$DEV_DIR" && terraform output -raw gateway_id 2>/dev/null || echo "")
if [ -z "$GATEWAY_ID" ]; then
  echo "  ✗ Could not read gateway_id from terraform output. Apply the stack first."
  exit 1
fi
echo "Gateway: $GATEWAY_ID"
echo ""

PYTHON="${PYTHON:-python3}"

"$PYTHON" - "$GATEWAY_ID" "$AWS_REGION" <<'PY'
import sys, time

try:
    import boto3, botocore
except ImportError:
    sys.exit("  ✗ boto3 is required. Install with: pip install --upgrade boto3")

gid, region = sys.argv[1], sys.argv[2]
client = boto3.client("bedrock-agentcore-control", region_name=region)

# The connector target shape is recent — verify this SDK's model supports it.
mcp_members = (
    client.meta.service_model
    .operation_model("CreateGatewayTarget")
    .input_shape.members["targetConfiguration"].members["mcp"].members
)
if "connector" not in mcp_members:
    sys.exit(
        f"  ✗ Installed botocore {botocore.__version__} is too old — its "
        "CreateGatewayTarget model has no 'connector' target type.\n"
        "    Upgrade with: pip install --upgrade boto3 botocore\n"
        "    (or run this script with PYTHON=/path/to/venv/bin/python)"
    )

# Idempotency: skip if a target named web-search already exists.
existing = [t.get("name") for t in client.list_gateway_targets(gatewayIdentifier=gid).get("items", [])]
if "web-search" in existing:
    print("  ✓ Target 'web-search' already exists — nothing to do.")
    sys.exit(0)

print("  ⏳ Creating 'web-search' connector target...")
client.create_gateway_target(
    gatewayIdentifier=gid,
    name="web-search",
    targetConfiguration={"mcp": {"connector": {
        "source": {"connectorId": "web-search"},
        "configurations": [{"name": "WebSearch", "parameterValues": {}}],
        # To restrict domains, use:
        # "configurations": [{"name": "WebSearch",
        #     "parameterValues": {"domainFilter": {"exclude": ["example.com"]}}}],
    }}},
    credentialProviderConfigurations=[{"credentialProviderType": "GATEWAY_IAM_ROLE"}],
)

print("  ⏳ Waiting for target to become READY...")
for _ in range(30):
    items = client.list_gateway_targets(gatewayIdentifier=gid).get("items", [])
    t = next((x for x in items if x.get("name") == "web-search"), None)
    status = t.get("status") if t else None
    if status == "READY":
        print("  ✓ Target 'web-search' is READY.")
        sys.exit(0)
    if status == "FAILED":
        sys.exit(f"  ✗ Target entered FAILED status: {t.get('statusReasons')}")
    time.sleep(5)

sys.exit("  ⚠ Timed out waiting for READY. Check the console.")
PY