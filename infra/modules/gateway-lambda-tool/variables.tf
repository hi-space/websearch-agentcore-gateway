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
