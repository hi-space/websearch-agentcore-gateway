#!/bin/bash
set -e

# ============================================================
# Seed API keys into AgentCore Identity Credential Providers
# ============================================================
# Usage:
#   ./scripts/seed-api-keys.sh
#
# This script reads API keys from terraform.tfvars and populates
# them into the AgentCore Identity credential providers created
# by the identity-providers module.
#
# Note: Requires aws bedrock-agentcore-control CLI to be available

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
INFRA_DIR="$( dirname "$SCRIPT_DIR" )"
DEV_DIR="$INFRA_DIR/environments/dev"

if [ ! -f "$DEV_DIR/terraform.tfvars" ]; then
  echo "ERROR: terraform.tfvars not found"
  exit 1
fi

# Get project name and region
PROJECT_NAME=$(grep '^project_name' "$DEV_DIR/terraform.tfvars" | cut -d'=' -f2 | xargs | tr -d '"')
AWS_REGION=$(grep '^aws_region' "$DEV_DIR/terraform.tfvars" | cut -d'=' -f2 | xargs | tr -d '"')

echo "=========================================="
echo "Seeding API Keys"
echo "=========================================="
echo "Project: $PROJECT_NAME"
echo "Region:  $AWS_REGION"
echo ""

# Extract API keys from terraform.tfvars
get_tfvar() {
  grep "^$1" "$DEV_DIR/terraform.tfvars" | cut -d'=' -f2 | xargs | tr -d '"' 2>/dev/null || echo ""
}

TAVILY_API_KEY=$(get_tfvar "tavily_api_key")
BRAVE_API_KEY=$(get_tfvar "brave_api_key")
SERPER_API_KEY=$(get_tfvar "serper_api_key")
EXA_API_KEY=$(get_tfvar "exa_api_key")
PERPLEXITY_API_KEY=$(get_tfvar "perplexity_api_key")

# Function to seed API key
seed_key() {
  local provider_name=$1
  local api_key=$2

  if [ -z "$api_key" ]; then
    echo "  ⚠ $provider_name: No API key (skipped)"
    return
  fi

  echo "  ⏳ $provider_name: Seeding..."

  aws bedrock-agentcore-control update-api-key-credential-provider \
    --name "$provider_name" \
    --api-key-wo "$api_key" \
    --api-key-wo-version "v1" \
    --region "$AWS_REGION" \
    2>/dev/null && echo "  ✓ $provider_name: Seeded" || echo "  ✗ $provider_name: Failed (provider may not exist)"
}

echo "Seeding API keys:"
seed_key "tavily" "$TAVILY_API_KEY"
seed_key "brave" "$BRAVE_API_KEY"
seed_key "serper" "$SERPER_API_KEY"
seed_key "exa" "$EXA_API_KEY"
seed_key "perplexity" "$PERPLEXITY_API_KEY"

echo ""
echo "API key seeding complete!"
