#!/bin/bash
set -e

# ============================================================
# Create an AgentCore inference (LLM-routing) gateway target
# ============================================================
# Demo of the "LLM Gateway" lens: route Bedrock inference through the gateway.
# The AWS Terraform provider can't express the inference target type yet, so
# this is created via the bedrock-agentcore-control API — mirroring
# scripts/create-web-search-target.sh.
#
# Idempotent: skips creation if a target named "bedrock-inference" exists.
# Gated on enable_inference_target in terraform.tfvars. us-east-1 only.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
INFRA_DIR="$( dirname "$SCRIPT_DIR" )"
DEV_DIR="$INFRA_DIR/environments/dev"

if [ ! -f "$DEV_DIR/terraform.tfvars" ]; then
  echo "ERROR: terraform.tfvars not found"; exit 1
fi

get_tfvar() {
  grep "^$1" "$DEV_DIR/terraform.tfvars" | cut -d'=' -f2 | xargs | tr -d '"' 2>/dev/null || echo ""
}

AWS_REGION=$(get_tfvar "aws_region")
ENABLE=$(get_tfvar "enable_inference_target")

echo "=========================================="
echo "Inference (LLM-routing) gateway target"
echo "=========================================="
echo "Region: $AWS_REGION"

if [ "$ENABLE" != "true" ]; then
  echo "  ⚠ enable_inference_target is not true — skipping."; exit 0
fi
if [ "$AWS_REGION" != "us-east-1" ]; then
  echo "  ✗ Inference targets demo is us-east-1 only (got '$AWS_REGION'). Aborting."; exit 1
fi

GATEWAY_ID=$(cd "$DEV_DIR" && terraform output -raw gateway_id 2>/dev/null || echo "")
if [ -z "$GATEWAY_ID" ]; then
  echo "  ✗ Could not read gateway_id from terraform output. Apply the stack first."; exit 1
fi
echo "Gateway: $GATEWAY_ID"

PYTHON="${PYTHON:-python3}"

"$PYTHON" - "$GATEWAY_ID" "$AWS_REGION" <<'PY'
import sys, time
try:
    import boto3, botocore
except ImportError:
    sys.exit("  ✗ boto3 is required. Install with: pip install --upgrade boto3")

gid, region = sys.argv[1], sys.argv[2]
client = boto3.client("bedrock-agentcore-control", region_name=region)

# Verify this SDK's model supports an inference/connector target shape. The exact
# member name MUST be confirmed against the installed model + AWS docs at run time.
mcp_members = (
    client.meta.service_model.operation_model("CreateGatewayTarget")
    .input_shape.members["targetConfiguration"].members["mcp"].members
)
if "connector" not in mcp_members:
    sys.exit(
        f"  ✗ Installed botocore {botocore.__version__} has no connector/inference "
        "target type.\n"
        "    Upgrade with: pip install --upgrade boto3 botocore\n"
        "    (or run this script with PYTHON=/path/to/venv/bin/python)"
    )

existing = [t.get("name") for t in client.list_gateway_targets(gatewayIdentifier=gid).get("items", [])]
if "bedrock-inference" in existing:
    print("  ✓ Target 'bedrock-inference' already exists — nothing to do."); sys.exit(0)

print("  ⏳ Creating 'bedrock-inference' target...")
# NOTE: confirm this exact shape against gateway-target-inference-connector.html
# at execution time before relying on it.
client.create_gateway_target(
    gatewayIdentifier=gid,
    name="bedrock-inference",
    targetConfiguration={"mcp": {"connector": {
        "source": {"connectorId": "bedrock-mantle"},
        "configurations": [{"name": "Inference", "parameterValues": {
            "modelId": "global.anthropic.claude-sonnet-4-5-20250929-v1:0"
        }}],
    }}},
    credentialProviderConfigurations=[{"credentialProviderType": "GATEWAY_IAM_ROLE"}],
)

print("  ⏳ Waiting for READY...")
for _ in range(30):
    items = client.list_gateway_targets(gatewayIdentifier=gid).get("items", [])
    t = next((x for x in items if x.get("name") == "bedrock-inference"), None)
    status = t.get("status") if t else None
    if status == "READY":
        print("  ✓ 'bedrock-inference' is READY."); sys.exit(0)
    if status == "FAILED":
        sys.exit(f"  ✗ FAILED: {t.get('statusReasons')}")
    time.sleep(5)
sys.exit("  ⚠ Timed out waiting for READY.")
PY
