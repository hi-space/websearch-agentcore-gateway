#!/bin/bash
set -e

# ============================================================
# Destroy infrastructure (convenience wrapper)
# ============================================================

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
INFRA_DIR="$( dirname "$SCRIPT_DIR" )"
DEV_DIR="$INFRA_DIR/environments/dev"

if [ ! -f "$DEV_DIR/terraform.tfvars" ]; then
  echo "ERROR: terraform.tfvars not found"
  exit 1
fi

PROJECT_NAME=$(grep '^project_name' "$DEV_DIR/terraform.tfvars" | cut -d'=' -f2 | xargs | tr -d '"')
AWS_REGION=$(grep '^aws_region' "$DEV_DIR/terraform.tfvars" | cut -d'=' -f2 | xargs | tr -d '"')

echo "=========================================="
echo "WARNING: Destroying infrastructure"
echo "=========================================="
echo "Project: $PROJECT_NAME"
echo "Region:  $AWS_REGION"
echo ""
read -p "Type 'yes' to confirm: " confirm

if [ "$confirm" != "yes" ]; then
  echo "Aborted"
  exit 0
fi

cd "$DEV_DIR"
terraform destroy
