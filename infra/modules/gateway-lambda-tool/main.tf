locals {
  src_dir    = "${var.source_root}/${var.tool_name}"
  shared_dir = "${var.source_root}/_shared"
  build_dir  = "${path.module}/.build/${var.tool_name}"
  zip_path   = "${path.module}/.build/${var.tool_name}.zip"
  fn_name    = "${var.project_name}-${var.environment}-tool-${var.tool_name}"

  # Hash includes handler, requirements, and every file in _shared/ so the package
  # is rebuilt whenever any shared helper changes.
  shared_files = fileset(local.shared_dir, "*.py")
  source_hash = sha1(join("", concat(
    compact([
      fileexists("${local.src_dir}/handler.py") ? filesha1("${local.src_dir}/handler.py") : "",
      fileexists("${local.src_dir}/requirements.txt") ? filesha1("${local.src_dir}/requirements.txt") : "",
    ]),
    [for f in local.shared_files : filesha1("${local.shared_dir}/${f}")],
  )))
}

# ============================================================
# Build Lambda deployment package
# ============================================================

resource "null_resource" "build" {
  triggers = {
    source_hash   = local.source_hash
    build_present = fileexists("${local.build_dir}/handler.py") ? "present" : "missing"
  }

  provisioner "local-exec" {
    command = <<-EOT
      set -e
      rm -rf "${local.build_dir}"
      mkdir -p "${local.build_dir}/_shared"
      cp "${local.src_dir}/handler.py" "${local.build_dir}/"
      cp "${local.shared_dir}"/*.py "${local.build_dir}/_shared/"
      if [ -f "${local.src_dir}/requirements.txt" ]; then
        ${var.pip_command} install -q --upgrade --target "${local.build_dir}" \
          --platform manylinux2014_aarch64 \
          --python-version 3.12 \
          --only-binary=:all: \
          --implementation cp \
          -r "${local.src_dir}/requirements.txt"
      fi
    EOT
  }
}

data "archive_file" "zip" {
  type        = "zip"
  source_dir  = local.build_dir
  output_path = local.zip_path
  depends_on  = [null_resource.build]
}

# ============================================================
# IAM Role for Lambda execution
# ============================================================

resource "aws_iam_role" "lambda" {
  name = "${local.fn_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "logs" {
  name = "logs"
  role = aws_iam_role.lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = "arn:aws:logs:${var.aws_region}:${var.account_id}:*"
    }]
  })
}

# Allow Lambda to call GetResourceApiKey for API key providers
resource "aws_iam_role_policy" "bedrock_agentcore" {
  name = "bedrock-agentcore"
  role = aws_iam_role.lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "bedrock-agentcore:GetResourceApiKey",
      ]
      Resource = "*"
    }]
  })
}

# Browser tool only: drive AgentCore browser sessions + invoke Bedrock models.
# Conditionally created so existing search tools are unaffected.
resource "aws_iam_role_policy" "browser" {
  count = var.browser_arn != "" ? 1 : 0
  name  = "browser"
  role  = aws_iam_role.lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      [{
        Effect = "Allow"
        Action = [
          "bedrock-agentcore:StartBrowserSession",
          "bedrock-agentcore:StopBrowserSession",
          "bedrock-agentcore:ConnectBrowserAutomationStream",
          "bedrock-agentcore:GetBrowserSession",
        ]
        Resource = var.browser_arn
      }],
      length(var.bedrock_model_arns) > 0 ? [{
        Effect   = "Allow"
        Action   = ["bedrock:InvokeModel"]
        Resource = var.bedrock_model_arns
      }] : [],
    )
  })
}

# ============================================================
# CloudWatch Log Group
# ============================================================

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${local.fn_name}"
  retention_in_days = var.log_retention_days
}

# ============================================================
# Lambda Function
# ============================================================

resource "aws_lambda_function" "this" {
  function_name = local.fn_name
  role          = aws_iam_role.lambda.arn
  handler       = "handler.lambda_handler"
  runtime       = "python3.12"
  architectures = ["arm64"]
  timeout       = var.timeout
  memory_size   = var.memory_size

  filename         = data.archive_file.zip.output_path
  source_code_hash = data.archive_file.zip.output_base64sha256

  environment {
    variables = merge(
      {
        PROJECT_NAME = var.project_name
        ENVIRONMENT  = var.environment
        # AWS_REGION is a Lambda-reserved environment variable that the runtime injects automatically.
      },
      var.env_vars,
    )
  }

  depends_on = [
    aws_cloudwatch_log_group.lambda,
    aws_iam_role_policy.logs,
    aws_iam_role_policy.bedrock_agentcore,
    aws_iam_role_policy.browser,
  ]
}
