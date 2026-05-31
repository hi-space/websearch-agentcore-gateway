data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  root_dir   = abspath("${path.module}/../../..")

  # Tools root directory
  tools_root = "${local.root_dir}/tools"

  # Determine which Lambda tools are enabled based on API key presence
  # Note: use local variables for existence check to avoid sensitive value exposure in for_each
  serper_enabled        = var.enable_serper
  exa_enabled           = var.enable_exa
  duckduckgo_enabled    = var.enable_duckduckgo
  perplexity_enabled    = var.enable_perplexity
  brave_enabled         = var.enable_brave
  anthropic_enabled     = var.enable_anthropic
  firecrawl_enabled     = var.enable_firecrawl
  you_enabled           = var.enable_you
  tavily_lambda_enabled = var.enable_tavily_lambda

  lambda_tools_enabled = {
    serper        = local.serper_enabled
    exa           = local.exa_enabled
    duckduckgo    = local.duckduckgo_enabled
    perplexity    = local.perplexity_enabled
    brave         = local.brave_enabled
    anthropic     = local.anthropic_enabled
    firecrawl     = local.firecrawl_enabled
    you           = local.you_enabled
    tavily_lambda = local.tavily_lambda_enabled
  }

  # Filter to only enabled tools
  enabled_lambda_tools = {
    for name, enabled in local.lambda_tools_enabled : name => enabled if enabled
  }

  # MCP server targets (external hosted MCP servers)
  mcp_server_targets = {
    # Tavily: hosted MCP server endpoint
    tavily = var.enable_tavily && var.tavily_api_key != "" ? {
      endpoint = "https://mcp.tavily.com/mcp/"
    } : null
  }

  # Filter out null entries
  enabled_mcp_targets = {
    for k, v in local.mcp_server_targets : k => v if v != null
  }

  # List of all enabled engines (for outputs)
  enabled_engines = concat(
    keys(local.enabled_lambda_tools),
    keys(local.enabled_mcp_targets),
  )
}

# ============================================================
# Authentication (Cognito)
# ============================================================

module "auth" {
  source = "../../modules/auth"

  project_name = var.project_name
  environment  = var.environment
  aws_region   = var.aws_region

  auth_mode              = var.auth_mode
  external_oidc_issuer   = var.external_oidc_issuer
  external_oidc_audience = var.external_oidc_audience
  cowork_redirect_uris   = var.cowork_redirect_uris
}

# ============================================================
# Identity Providers (API Key Credential Providers)
# ============================================================

module "identity_providers" {
  source = "../../modules/identity-providers"

  project_name = var.project_name
  environment  = var.environment
  aws_region   = var.aws_region

  api_key_providers = {
    tavily = var.enable_tavily && var.tavily_api_key != "" ? {
      display_name = "Tavily Search"
      description  = "Tavily web search API"
    } : null

    brave = var.enable_brave && var.brave_api_key != "" ? {
      display_name = "Brave Search"
      description  = "Brave independent web search"
    } : null

    serper = var.enable_serper && var.serper_api_key != "" ? {
      display_name = "Serper Search"
      description  = "Serper SERP API"
    } : null

    exa = var.enable_exa && var.exa_api_key != "" ? {
      display_name = "Exa Search"
      description  = "Exa neural search API"
    } : null

    perplexity = var.enable_perplexity && var.perplexity_api_key != "" ? {
      display_name = "Perplexity Sonar"
      description  = "Perplexity Sonar API"
    } : null

    anthropic = var.enable_anthropic && var.anthropic_api_key != "" ? {
      display_name = "Anthropic Claude"
      description  = "Anthropic Claude built-in web search"
    } : null

    firecrawl = var.enable_firecrawl && var.firecrawl_api_key != "" ? {
      display_name = "Firecrawl Search"
      description  = "Firecrawl web search API"
    } : null

    you = var.enable_you && var.you_api_key != "" ? {
      display_name = "You.com Search"
      description  = "You.com web search API"
    } : null
  }
}

# Flatten and filter identity provider map.
# nonsensitive() unwraps the sensitive marking that propagates from the api_key_wo
# argument on aws_bedrockagentcore_api_key_credential_provider. ARNs are not secrets;
# only the API keys themselves (write-only) are.
locals {
  filtered_identity_providers = nonsensitive({
    for k, v in module.identity_providers.credential_provider_arns : k => v
  })
}

# ============================================================
# Lambda Tools (conditional for each enabled engine)
# ============================================================

module "lambda_tools" {
  for_each = local.enabled_lambda_tools

  source = "../../modules/gateway-lambda-tool"

  project_name = var.project_name
  environment  = var.environment
  aws_region   = var.aws_region
  account_id   = local.account_id

  tool_name   = each.key
  source_root = local.tools_root

  env_vars = merge(
    # DuckDuckGo has no API key and therefore no Identity provider; only inject ARN when one exists.
    contains(keys(local.filtered_identity_providers), each.key) ? {
      IDENTITY_PROVIDER_ARN = local.filtered_identity_providers[each.key]
    } : {},
    each.key == "serper" && var.serper_api_key != "" ? {
      SERPER_API_KEY = var.serper_api_key
    } : {},
    each.key == "exa" && var.exa_api_key != "" ? {
      EXA_API_KEY = var.exa_api_key
    } : {},
    each.key == "perplexity" && var.perplexity_api_key != "" ? {
      PERPLEXITY_API_KEY = var.perplexity_api_key
    } : {},
    each.key == "brave" && var.brave_api_key != "" ? {
      BRAVE_API_KEY = var.brave_api_key
    } : {},
    each.key == "anthropic" && var.anthropic_api_key != "" ? {
      ANTHROPIC_API_KEY = var.anthropic_api_key
    } : {},
    each.key == "firecrawl" && var.firecrawl_api_key != "" ? {
      FIRECRAWL_API_KEY = var.firecrawl_api_key
    } : {},
    each.key == "you" && var.you_api_key != "" ? {
      YOU_API_KEY = var.you_api_key
    } : {},
    # tavily_lambda reuses the Tavily key, injected directly as an env var.
    each.key == "tavily_lambda" && var.tavily_api_key != "" ? {
      TAVILY_API_KEY = var.tavily_api_key
    } : {},
  )

  timeout            = 60
  memory_size        = 512
  log_retention_days = 7

  depends_on = [module.identity_providers]
}

# ============================================================
# MCP Server Targets (external MCP servers)
# ============================================================

module "gateway_mcp_targets" {
  source = "../../modules/gateway-mcp-target"

  mcp_server_targets = {
    for k, v in local.enabled_mcp_targets : k => {
      endpoint            = v.endpoint
      credential_provider = local.filtered_identity_providers[k]
      description         = "${k} hosted MCP server"
    }
  }
}

# ============================================================
# AgentCore Gateway
# ============================================================

module "gateway" {
  source = "../../modules/gateway"

  project_name = var.project_name
  environment  = var.environment
  aws_region   = var.aws_region
  account_id   = local.account_id

  cognito_issuer_url      = module.auth.issuer_url
  cognito_allowed_clients = [module.auth.app_client_id, module.auth.web_client_id, module.auth.m2m_client_id]

  lambda_tool_arns = {
    for k, m in module.lambda_tools : k => m.function_arn
  }

  mcp_server_targets     = module.gateway_mcp_targets.mcp_server_endpoints
  mcp_server_credentials = module.gateway_mcp_targets.mcp_server_credentials

  # How each external MCP server expects its API key to be injected.
  # Tavily's hosted MCP server reads the key from the `tavilyApiKey` query param.
  mcp_server_credential_location = {
    tavily = "QUERY_PARAMETER"
  }
  mcp_server_credential_param = {
    tavily = "tavilyApiKey"
  }

  depends_on = [module.auth, module.lambda_tools, module.gateway_mcp_targets]
}

# ============================================================
# Observability (CloudWatch Logs + Vended Logs)
# ============================================================

module "observability" {
  source = "../../modules/observability"

  project_name = var.project_name
  environment  = var.environment
  aws_region   = var.aws_region

  gateway_id         = module.gateway.gateway_id
  gateway_arn        = module.gateway.gateway_arn
  enable_otlp_export = var.enable_otlp_export
  otlp_endpoint      = var.otlp_endpoint

  trace_sampling_percentage  = var.trace_sampling_percentage
  manage_trace_indexing_rule = var.manage_trace_indexing_rule

  depends_on = [module.gateway]
}
