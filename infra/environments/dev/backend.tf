# ============================================================
# Terraform Backend Configuration
# ============================================================
# After running bootstrap/, uncomment and populate the backend block below
# using the output from bootstrap/outputs.tf

terraform {
  backend "s3" {
    # bucket         = "websearch-gw-tfstate-<account>-ap-northeast-2"
    # region         = "ap-northeast-2"
    # encrypt        = true
    # dynamodb_table = "websearch-gw-tfstate-lock"
    # key            = "dev/terraform.tfstate"
  }
}
