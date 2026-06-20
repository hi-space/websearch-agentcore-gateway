variable "project_name" {
  type        = string
  description = "Project identifier"
  default     = "websearch-gw"
}

variable "environment" {
  type        = string
  description = "Environment name"
  default     = "dev"
}

variable "aws_region" {
  type        = string
  description = "AWS region (must be us-east-1)"
  default     = "us-east-1"

  validation {
    condition     = var.aws_region == "us-east-1"
    error_message = "Region must be us-east-1 (N. Virginia) — the AgentCore Web Search Tool connector is only available there."
  }
}

# ============================================================
# Search Engine Toggles
# ============================================================

variable "enable_tavily" {
  type        = bool
  description = "Enable Tavily search engine"
  default     = true
}

variable "tavily_api_key" {
  type        = string
  description = "Tavily API key"
  default     = ""
  sensitive   = true
}

variable "enable_brave" {
  type        = bool
  description = "Enable Brave search engine"
  default     = true
}

variable "brave_api_key" {
  type        = string
  description = "Brave API key"
  default     = ""
  sensitive   = true
}

variable "enable_serper" {
  type        = bool
  description = "Enable Serper search engine"
  default     = false
}

variable "serper_api_key" {
  type        = string
  description = "Serper API key"
  default     = ""
  sensitive   = true
}

variable "enable_exa" {
  type        = bool
  description = "Enable Exa search engine"
  default     = false
}

variable "exa_api_key" {
  type        = string
  description = "Exa API key"
  default     = ""
  sensitive   = true
}

variable "enable_duckduckgo" {
  type        = bool
  description = "Enable DuckDuckGo search engine"
  default     = true
}

variable "enable_perplexity" {
  type        = bool
  description = "Enable Perplexity search engine"
  default     = false
}

variable "perplexity_api_key" {
  type        = string
  description = "Perplexity API key"
  default     = ""
  sensitive   = true
}

variable "enable_anthropic" {
  type        = bool
  description = "Enable Anthropic Claude built-in web search engine"
  default     = false
}

variable "anthropic_api_key" {
  type        = string
  description = "Anthropic API key"
  default     = ""
  sensitive   = true
}

variable "enable_firecrawl" {
  type        = bool
  description = "Enable Firecrawl search engine"
  default     = false
}

variable "firecrawl_api_key" {
  type        = string
  description = "Firecrawl API key"
  default     = ""
  sensitive   = true
}

variable "enable_you" {
  type        = bool
  description = "Enable You.com search engine"
  default     = false
}

variable "you_api_key" {
  type        = string
  description = "You.com API key"
  default     = ""
  sensitive   = true
}

variable "enable_tavily_lambda" {
  type        = bool
  description = "Enable the Lambda-backed Tavily search engine (distinct from the hosted Tavily MCP server target). Reuses tavily_api_key."
  default     = false
}

variable "enable_searxng" {
  type        = bool
  description = "Enable the SearXNG metasearch engine. Provisions a VPC + ECS Fargate SearXNG instance (internal ALB) and a VPC-attached Lambda tool. Costs ~$70-85/mo when on; nothing when off."
  default     = false
}

variable "enable_browser" {
  type        = bool
  description = "Enable the AgentCore Browser task tool"
  default     = false
}

variable "browser_model_id" {
  type        = string
  description = "Bedrock model ID that browser-use drives inside the browser tool Lambda"
  default     = "global.anthropic.claude-haiku-4-5-20251001-v1:0"
}

variable "browser_model_arns" {
  type        = list(string)
  description = "Bedrock model/inference-profile ARNs the browser tool Lambda may invoke. Leave empty to auto-grant the default Claude Haiku 4.5 ARNs; override when changing browser_model_id."
  default     = []
}

# ============================================================
# Authentication
# ============================================================

variable "auth_mode" {
  type        = string
  description = "Authentication mode: cognito or external_oidc"
  default     = "cognito"

  validation {
    condition     = contains(["cognito", "external_oidc"], var.auth_mode)
    error_message = "auth_mode must be 'cognito' or 'external_oidc'"
  }
}

variable "external_oidc_issuer" {
  type        = string
  description = "External OIDC issuer URL (required if auth_mode=external_oidc)"
  default     = ""
}

variable "external_oidc_audience" {
  type        = string
  description = "External OIDC audience"
  default     = ""
}

variable "cowork_redirect_uris" {
  type        = list(string)
  description = "Cowork callback URIs"
  default     = ["http://localhost:3000/callback"]
}

# ============================================================
# Observability
# ============================================================

variable "trace_sampling_percentage" {
  type        = number
  description = "X-Ray Transaction Search indexing sampling %, 0-100. 100 in dev for full trace visibility; lower in prod (account+region-global Default rule)."
  default     = 100
}

variable "manage_trace_indexing_rule" {
  type        = bool
  description = "Whether this stack owns the account/region-global X-Ray Default indexing rule. Set false if another stack in this region already manages it."
  default     = true
}

variable "enable_otlp_export" {
  type        = bool
  description = "Export OTLP traces to external backend"
  default     = false
}

variable "otlp_endpoint" {
  type        = string
  description = "OTLP collector endpoint"
  default     = ""
}
