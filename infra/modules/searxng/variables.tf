variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "vpc_cidr" {
  type        = string
  description = "CIDR block for the SearXNG VPC"
  default     = "10.0.0.0/16"
}

variable "searxng_image" {
  type        = string
  description = "SearXNG container image. Pinned for a stable entrypoint path (see main.tf settings injection)."
  default     = "searxng/searxng:2026.6.5-37187dc2d"
}

variable "fargate_cpu" {
  type        = number
  description = "Fargate task CPU units"
  default     = 512
}

variable "fargate_memory" {
  type        = number
  description = "Fargate task memory (MiB)"
  default     = 1024
}

variable "log_retention_days" {
  type    = number
  default = 7
}
