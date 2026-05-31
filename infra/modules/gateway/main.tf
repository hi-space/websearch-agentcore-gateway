locals {
  gateway_name = "${var.project_name}-${var.environment}-gateway"
}

# ============================================================
# Gateway IAM Role (invokes Lambda targets, calls Identity API)
# ============================================================

resource "aws_iam_role" "gateway" {
  name = "${local.gateway_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "bedrock-agentcore.amazonaws.com" }
      Action    = ["sts:AssumeRole", "sts:TagSession"]
    }]
  })
}

resource "aws_iam_role_policy" "gateway" {
  name = "gateway-policy"
  role = aws_iam_role.gateway.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      length(var.lambda_tool_arns) > 0 ? [{
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = values(var.lambda_tool_arns)
      }] : [],
      [{
        Effect = "Allow"
        Action = [
          "bedrock-agentcore:GetResourceApiKey",
          "bedrock-agentcore:GetWorkloadAccessToken",
          "bedrock-agentcore:GetWorkloadAccessTokenForJwt",
        ]
        Resource = "*"
      }],
      # MCP server targets (Tavily/Brave) inject an outbound API key that the
      # AgentCore Identity token vault stores in Secrets Manager. The gateway
      # role must be able to read those vault secrets.
      [{
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = "arn:aws:secretsmanager:${var.aws_region}:${var.account_id}:secret:bedrock-agentcore-identity!default/apikey/*"
      }],
    )
  })
}

# ============================================================
# AgentCore Gateway (CUSTOM_JWT, MCP protocol)
# ============================================================

resource "aws_bedrockagentcore_gateway" "this" {
  name        = local.gateway_name
  description = "MCP Gateway for ${var.project_name}"
  role_arn    = aws_iam_role.gateway.arn

  authorizer_type = "CUSTOM_JWT"
  protocol_type   = "MCP"

  authorizer_configuration {
    custom_jwt_authorizer {
      discovery_url   = "${var.cognito_issuer_url}/.well-known/openid-configuration"
      allowed_clients = var.cognito_allowed_clients
    }
  }

  protocol_configuration {
    mcp {
      instructions       = "Web search tool gateway for ${var.project_name}"
      search_type        = "SEMANTIC"
      supported_versions = ["2025-11-25"]
    }
  }

  exception_level = "DEBUG"

  tags = {
    Component = "gateway"
  }

  lifecycle {
    ignore_changes = [description]
  }
}

# Wait for IAM propagation before creating targets
resource "time_sleep" "wait_for_iam_propagation" {
  depends_on      = [aws_bedrockagentcore_gateway.this]
  create_duration = "5s"
}

# ============================================================
# Lambda-backed Gateway Targets
# ============================================================
# Every Lambda search tool exposes the same MCP tool:
#   web_search(query, num_results, country, freshness).
# Schema is defined inline because all engines share an identical contract.
# country/freshness are normalized here and each handler translates them into
# its provider's native parameters (see tools/_shared/search_params.py).

resource "aws_bedrockagentcore_gateway_target" "lambda" {
  for_each = var.lambda_tool_arns

  gateway_identifier = aws_bedrockagentcore_gateway.this.gateway_id
  # Gateway target names must match ^([0-9a-zA-Z][-]?){1,100}$ — no underscores,
  # so engine keys like "tavily_lambda" are rendered with a hyphen here.
  name        = replace(each.key, "_", "-")
  description = "Web search via ${each.key}"

  credential_provider_configuration {
    gateway_iam_role {}
  }

  target_configuration {
    mcp {
      lambda {
        lambda_arn = each.value
        tool_schema {
          inline_payload {
            name        = "web_search"
            description = "Run a web search using the ${each.key} engine and return ranked results."
            input_schema {
              type        = "object"
              description = "Search query parameters."
              property {
                name        = "query"
                type        = "string"
                description = "The search query string."
                required    = true
              }
              property {
                name        = "num_results"
                type        = "integer"
                description = "Maximum number of results to return (1-20)."
                required    = false
              }
              property {
                name        = "country"
                type        = "string"
                description = "Two-letter country code (e.g., KR, US) to localize results. Not all engines honor this."
                required    = false
              }
              property {
                name        = "freshness"
                type        = "string"
                description = "Restrict results by recency. One of: day, week, month, year. Not all engines honor this."
                required    = false
              }
            }
          }
        }
      }
    }
  }

  depends_on = [time_sleep.wait_for_iam_propagation]
}

# ============================================================
# MCP Server-backed Gateway Targets (external MCP servers)
# ============================================================

resource "aws_bedrockagentcore_gateway_target" "mcp_server" {
  for_each = var.mcp_server_targets

  gateway_identifier = aws_bedrockagentcore_gateway.this.gateway_id
  name               = each.key
  description        = "MCP Server target: ${each.key}"

  # External MCP servers (Tavily/Brave) authenticate with an outbound API key,
  # which the gateway injects from the AgentCore Identity token vault. The API
  # rejects gateway_iam_role for mcpServer targets, so an api_key credential
  # provider is required here.
  credential_provider_configuration {
    api_key {
      provider_arn              = var.mcp_server_credentials[each.key]
      credential_location       = lookup(var.mcp_server_credential_location, each.key, "QUERY_PARAMETER")
      credential_parameter_name = lookup(var.mcp_server_credential_param, each.key, null)
    }
  }

  target_configuration {
    mcp {
      mcp_server {
        endpoint = each.value
      }
    }
  }

  depends_on = [time_sleep.wait_for_iam_propagation]
}
