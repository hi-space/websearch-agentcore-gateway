#!/bin/bash
set -e

# ============================================================
# Create the AgentCore custom evaluators for search quality
# ============================================================
# Usage:
#   ./scripts/create-evaluators.sh
#
# Creates two LLM-as-a-judge evaluators (search-relevance, search-authority)
# from the committed rubrics in infra/evaluators/*.json, via the
# bedrock-agentcore-control API — mirroring scripts/create-web-search-target.sh.
#
# create_evaluator is recent, so it needs a current botocore. This script calls
# the API through boto3 and verifies the SDK is new enough.
#
# Idempotent: skips creation if an evaluator with the same name already exists.
# us-east-1 only (Evaluate API is not available in Seoul). Prints evaluator ids
# for use in dashboard/.env.local (JUDGE_RELEVANCE_EVALUATOR_ID /
# JUDGE_AUTHORITY_EVALUATOR_ID).

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
INFRA_DIR="$( dirname "$SCRIPT_DIR" )"
DEV_DIR="$INFRA_DIR/environments/dev"
EVAL_DIR="$INFRA_DIR/evaluators"

if [ ! -f "$DEV_DIR/terraform.tfvars" ]; then
  echo "ERROR: terraform.tfvars not found"
  exit 1
fi

get_tfvar() {
  grep "^$1" "$DEV_DIR/terraform.tfvars" | cut -d'=' -f2 | xargs | tr -d '"' 2>/dev/null || echo ""
}

AWS_REGION=$(get_tfvar "aws_region")

echo "=========================================="
echo "AgentCore search-quality evaluators"
echo "=========================================="
echo "Region: $AWS_REGION"
echo ""

# Evaluate API / evaluators are us-east-1 only here (Seoul unsupported).
if [ "$AWS_REGION" != "us-east-1" ]; then
  echo "  ✗ AgentCore Evaluations require us-east-1 (got '$AWS_REGION'). Aborting."
  exit 1
fi

PYTHON="${PYTHON:-python3}"

"$PYTHON" - "$AWS_REGION" "$EVAL_DIR" <<'PY'
import sys, json, os

try:
    import boto3, botocore
except ImportError:
    sys.exit("  ✗ boto3 is required. Install with: pip install --upgrade boto3")

region, eval_dir = sys.argv[1], sys.argv[2]
client = boto3.client("bedrock-agentcore-control", region_name=region)

# create_evaluator is recent — verify this SDK's model supports it.
ops = client.meta.service_model.operation_names
if "CreateEvaluator" not in ops:
    sys.exit(
        f"  ✗ Installed botocore {botocore.__version__} is too old — it has no "
        "CreateEvaluator operation.\n"
        "    Upgrade with: pip install --upgrade boto3 botocore\n"
        "    (or run this script with PYTHON=/path/to/venv/bin/python)"
    )

existing = {e.get("name"): e for e in client.list_evaluators().get("items", [])}

EVALUATORS = [
    ("search-relevance", os.path.join(eval_dir, "relevance.json")),
    ("search-authority", os.path.join(eval_dir, "authority.json")),
]

for name, path in EVALUATORS:
    if name in existing:
        eid = existing[name].get("evaluatorId") or existing[name].get("id")
        print(f"  ✓ Evaluator '{name}' already exists — id={eid}")
        continue
    with open(path) as f:
        config = json.load(f)
    print(f"  ⏳ Creating evaluator '{name}'...")
    resp = client.create_evaluator(
        name=name,
        evaluatorConfig=config,
        evaluationLevel="TRACE",
    )
    eid = resp.get("evaluatorId") or resp.get("id")
    print(f"  ✓ Created '{name}' — id={eid}")

print("")
print("  Set these in dashboard/.env.local:")
print("    JUDGE_RELEVANCE_EVALUATOR_ID=<search-relevance id above>")
print("    JUDGE_AUTHORITY_EVALUATOR_ID=<search-authority id above>")
PY
