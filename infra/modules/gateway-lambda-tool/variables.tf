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

variable "tool_name" {
  type        = string
  description = "Name of the tool (e.g., serper, exa, duckduckgo)"
}

variable "source_root" {
  type        = string
  description = "Root directory where tool source code is located (e.g., /path/to/tools)"
}

variable "env_vars" {
  type        = map(string)
  description = "Environment variables to pass to the Lambda function"
  default     = {}
}

variable "timeout" {
  type        = number
  description = "Lambda function timeout in seconds"
  default     = 60
}

variable "memory_size" {
  type        = number
  description = "Lambda function memory size in MB"
  default     = 512
}

variable "log_retention_days" {
  type        = number
  description = "CloudWatch log retention in days"
  default     = 7
}

variable "pip_command" {
  type        = string
  description = "pip command to use for dependency installation"
  default     = "pip3"
}

variable "browser_arn" {
  type        = string
  description = "If set, grants this Lambda permission to drive the given AgentCore browser and invoke Bedrock models (used only by the browser tool)."
  default     = ""
}

variable "enable_browser_policy" {
  type        = bool
  description = "Whether to attach the browser-session + Bedrock InvokeModel policy. Set true only for the browser tool. Gated as a plan-time-known bool (browser_arn is computed)."
  default     = false
}

variable "bedrock_model_arns" {
  type        = list(string)
  description = "Bedrock model/inference-profile ARNs the browser tool may invoke."
  default     = []
}

variable "vpc_config" {
  type = object({
    subnet_ids         = list(string)
    security_group_ids = list(string)
  })
  description = "If set, attaches the Lambda to a VPC (used by the SearXNG tool to reach its internal ALB). null leaves the Lambda outside any VPC, unchanged."
  default     = null
}
