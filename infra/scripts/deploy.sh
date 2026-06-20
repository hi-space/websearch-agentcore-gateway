#!/bin/bash
set -e

# ============================================================
# Terraform deployment script for websearch-tool-gateway
# ============================================================
# Usage:
#   ./scripts/deploy.sh [init|plan|apply|destroy]
#
# Workflow:
#   1. bootstrap/  — create S3 state bucket
#   2. init        — initialize Terraform with backend
#   3. plan        — review infrastructure changes
#   4. apply       — deploy infrastructure
#   5. seed-api-keys.sh — populate API keys into Identity providers

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
INFRA_DIR="$( dirname "$SCRIPT_DIR" )"
BOOTSTRAP_DIR="$INFRA_DIR/bootstrap"
DEV_DIR="$INFRA_DIR/environments/dev"

ACTION="${1:-apply}"

if [ ! -f "$DEV_DIR/terraform.tfvars" ]; then
  echo "ERROR: Missing terraform.tfvars in $DEV_DIR"
  echo "Copy from terraform.tfvars.example and fill in API keys:"
  echo "  cp $DEV_DIR/terraform.tfvars.example $DEV_DIR/terraform.tfvars"
  echo "  editor $DEV_DIR/terraform.tfvars"
  exit 1
fi

# Load tfvars to get project name and region
PROJECT_NAME=$(grep '^project_name' "$DEV_DIR/terraform.tfvars" | cut -d'=' -f2 | xargs | tr -d '"')
AWS_REGION=$(grep '^aws_region' "$DEV_DIR/terraform.tfvars" | cut -d'=' -f2 | xargs | tr -d '"')
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

STATE_BUCKET="${PROJECT_NAME}-tfstate-${ACCOUNT_ID}-${AWS_REGION}"

echo "=========================================="
echo "Web Search Tool Gateway — Terraform Deploy"
echo "=========================================="
echo "Project: $PROJECT_NAME"
echo "Region:  $AWS_REGION"
echo "Account: $ACCOUNT_ID"
echo ""

case "$ACTION" in
  bootstrap)
    echo "Step 1: Creating S3 state bucket and DynamoDB lock table..."
    cd "$BOOTSTRAP_DIR"
    terraform init -backend=false
    terraform apply -auto-approve \
      -var="project_name=$PROJECT_NAME" \
      -var="aws_region=$AWS_REGION"
    echo ""
    echo "Bootstrap complete. Backend config:"
    terraform output -raw backend_hcl
    echo ""
    ;;

  init)
    echo "Step 2: Initializing Terraform with backend..."
    cd "$DEV_DIR"
    terraform init \
      -backend-config="bucket=$STATE_BUCKET" \
      -backend-config="region=$AWS_REGION" \
      -backend-config="encrypt=true" \
      -backend-config="dynamodb_table=${PROJECT_NAME}-tfstate-lock" \
      -backend-config="key=dev/terraform.tfstate"
    echo "Terraform initialized successfully"
    ;;

  plan)
    echo "Step 3: Planning infrastructure changes..."
    cd "$DEV_DIR"
    terraform plan -out=tfplan
    echo ""
    echo "Plan saved to tfplan. Review and run 'apply' to deploy."
    ;;

  apply)
    echo "Step 3-4: Planning and applying infrastructure..."
    cd "$DEV_DIR"
    terraform apply -auto-approve
    echo ""
    echo "Infrastructure deployed successfully!"
    echo ""
    echo "Gateway URL:"
    terraform output -raw gateway_url
    echo ""
    echo "Next steps:"
    echo "  1. Seed API keys: $SCRIPT_DIR/seed-api-keys.sh"
    echo "  2. Create Web Search target: $SCRIPT_DIR/create-web-search-target.sh"
    echo "  3. Set up Cowork: cowork/setup-mac.sh or setup-windows.ps1"
    ;;

  destroy)
    echo "WARNING: This will destroy all infrastructure for $PROJECT_NAME in $AWS_REGION"
    read -p "Type 'yes' to confirm: " confirm
    if [ "$confirm" != "yes" ]; then
      echo "Aborted"
      exit 1
    fi
    cd "$DEV_DIR"
    terraform destroy
    ;;

  *)
    echo "Usage: $0 [bootstrap|init|plan|apply|destroy]"
    exit 1
    ;;
esac
