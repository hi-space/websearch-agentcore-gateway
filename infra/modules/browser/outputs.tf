output "browser_id" {
  value       = aws_bedrockagentcore_browser.this.browser_id
  description = "AgentCore custom Browser ID"
}

output "browser_arn" {
  value       = aws_bedrockagentcore_browser.this.browser_arn
  description = "AgentCore custom Browser ARN"
}
