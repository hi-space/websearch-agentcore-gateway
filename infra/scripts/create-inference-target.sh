#!/bin/bash
set -e

# ============================================================
# Create AgentCore inference (LLM-routing) gateway targets
# ============================================================
# The "LLM Gateway" lens: route model inference through the gateway. Inference
# targets are a distinct target type ("inference", not "mcp") and are invoked at
# the gateway's /inference/v1/* path with model-based routing — they do NOT
# appear in tools/list. Shape verified against:
#   https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-target-inference-connector.html
#   {"inference": {"connector": {"source": {"connectorId": "bedrock-mantle"}}}}
#
# The AWS Terraform provider can't express inference targets yet, so this is
# created via bedrock-agentcore-control — mirroring create-web-search-target.sh.
#
# Connectors created:
#   - bedrock-mantle : Amazon Bedrock models. GATEWAY_IAM_ROLE auth (no API key).
#   - anthropic      : Anthropic API. Needs an "anthropic" API-key credential
#                      provider in the Identity vault (reused from the search tool).
#   - openai         : OpenAI API. Created only if an "openai" credential provider
#                      exists in the vault; skipped otherwise (no key on this acct).
#
# Idempotent: skips a connector whose target name already exists.
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
echo "Inference (LLM-routing) gateway targets"
echo "=========================================="
echo "Region: $AWS_REGION"

if [ "$ENABLE" != "true" ]; then
  echo "  ⚠ enable_inference_target is not true — skipping."; exit 0
fi
if [ "$AWS_REGION" != "us-east-1" ]; then
  echo "  ✗ Inference targets are us-east-1 only (got '$AWS_REGION'). Aborting."; exit 1
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

# Verify this SDK's model supports the "inference" target type. The inference
# connector shape is recent; an old botocore lacks it and must be upgraded.
tc_members = (
    client.meta.service_model.operation_model("CreateGatewayTarget")
    .input_shape.members["targetConfiguration"].members
)
if "inference" not in tc_members:
    sys.exit(
        f"  ✗ Installed botocore {botocore.__version__} has no 'inference' target "
        "type.\n"
        "    Upgrade with: pip install --upgrade boto3 botocore\n"
        "    (or run this script with PYTHON=/path/to/venv/bin/python)"
    )

# Look up API-key credential providers in the Identity vault by name so the
# anthropic/openai connectors can authenticate outbound. bedrock-mantle uses the
# gateway IAM role and needs none.
vault = {}
try:
    resp = client.list_api_key_credential_providers()
    # The credential-provider API returns "credentialProviders" (the targets API
    # uses "items" — different shape); accept either for forward-compatibility.
    for p in resp.get("credentialProviders") or resp.get("items") or []:
        arn = p.get("credentialProviderArn") or p.get("apiKeyCredentialProviderArn")
        if p.get("name") and arn:
            vault[p["name"]] = arn
except Exception as e:
    print(f"  ⚠ Could not list credential providers ({e}); only bedrock-mantle will be created.")

def iam_role_cred():
    return [{"credentialProviderType": "GATEWAY_IAM_ROLE"}]

def api_key_cred(provider_arn, header="Authorization", prefix="Bearer "):
    cfg = {
        "providerArn": provider_arn,
        "credentialLocation": "HEADER",
        "credentialParameterName": header,
    }
    if prefix:
        cfg["credentialPrefix"] = prefix
    return [{
        "credentialProviderType": "API_KEY",
        "credentialProvider": {"apiKeyCredentialProvider": cfg},
    }]

# (target name, connectorId, credential provider configurations) — only those
# whose prerequisites are met are attempted.
# Target names are suffixed "-inference" to avoid colliding with the same-named
# MCP search-tool targets (e.g. the existing "anthropic" MCP target). Model-based
# routing keys off the connector's models, not the target name, so the suffix is
# cosmetic for routing but keeps the two target kinds distinct.
targets = [("bedrock-mantle", "bedrock-mantle", iam_role_cred())]
if "anthropic" in vault:
    targets.append(("anthropic-inference", "anthropic",
                    api_key_cred(vault["anthropic"], header="x-api-key", prefix="")))
else:
    print("  ⚠ No 'anthropic' credential provider in vault — skipping anthropic target.")
if "openai" in vault:
    targets.append(("openai-inference", "openai", api_key_cred(vault["openai"])))
else:
    print("  ⚠ No 'openai' credential provider in vault — skipping openai target "
          "(add an OpenAI API key to the vault to enable it).")

existing = {t.get("name") for t in client.list_gateway_targets(gatewayIdentifier=gid).get("items", [])}

def wait_ready(name):
    for _ in range(30):
        items = client.list_gateway_targets(gatewayIdentifier=gid).get("items", [])
        t = next((x for x in items if x.get("name") == name), None)
        status = t.get("status") if t else None
        if status == "READY":
            print(f"  ✓ '{name}' is READY."); return True
        if status == "FAILED":
            print(f"  ✗ '{name}' FAILED: {t.get('statusReasons')}"); return False
        time.sleep(5)
    print(f"  ⚠ '{name}' timed out waiting for READY."); return False

failures = 0
for name, connector_id, creds in targets:
    if name in existing:
        print(f"  ✓ Target '{name}' already exists — skipping.")
        continue
    print(f"  ⏳ Creating '{name}' (connectorId={connector_id})...")
    client.create_gateway_target(
        gatewayIdentifier=gid,
        name=name,
        targetConfiguration={"inference": {"connector": {"source": {"connectorId": connector_id}}}},
        credentialProviderConfigurations=creds,
    )
    if not wait_ready(name):
        failures += 1

sys.exit(1 if failures else 0)
PY
