# ============================================================
# Terraform Backend Configuration (partial)
# ============================================================
# This block is intentionally empty. Backend settings (bucket, region,
# dynamodb_table, key) are supplied at init time via -backend-config so
# the account-specific state bucket name never lands in version control.
#
# Initialize via the deploy script (reads project/region from tfvars and
# derives the bucket from the caller account):
#
#   ./scripts/deploy.sh init
#
# Or pass them yourself:
#
#   terraform init \
#     -backend-config="bucket=<project>-tfstate-<account>-<region>" \
#     -backend-config="region=<region>" \
#     -backend-config="encrypt=true" \
#     -backend-config="dynamodb_table=<project>-tfstate-lock" \
#     -backend-config="key=dev/terraform.tfstate"

terraform {
  backend "s3" {}
}
