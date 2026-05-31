variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "account_id" {
  type = string
}

variable "cognito_issuer_url" {
  type        = string
  description = "Cognito OIDC issuer URL for JWT validation"
}

variable "cognito_allowed_clients" {
  type        = list(string)
  description = "List of Cognito client IDs allowed to invoke the gateway"
}

variable "lambda_tool_arns" {
  type        = map(string)
  description = "Map of tool_name -> lambda_function_arn for Lambda targets"
  default     = {}
}

variable "mcp_server_targets" {
  type        = map(string)
  description = "Map of tool_name -> mcp_server_url for external MCP server targets"
  default     = {}
}

variable "mcp_server_credentials" {
  type        = map(string)
  description = "Map of tool_name -> api_key_credential_provider_arn for outbound MCP auth"
  default     = {}
}

variable "mcp_server_credential_location" {
  type        = map(string)
  description = "Map of tool_name -> where the API key is injected (HEADER or QUERY_PARAMETER)"
  default     = {}
}

variable "mcp_server_credential_param" {
  type        = map(string)
  description = "Map of tool_name -> name of the header/query param carrying the API key"
  default     = {}
}
