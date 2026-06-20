output "alb_dns_name" {
  description = "Internal ALB DNS name the SearXNG tool Lambda calls"
  value       = aws_lb.this.dns_name
}

output "private_subnet_ids" {
  description = "Private subnets the SearXNG tool Lambda attaches to"
  value       = aws_subnet.private[*].id
}

output "lambda_security_group_id" {
  description = "Security group the SearXNG tool Lambda must use (trusted by the ALB)"
  value       = aws_security_group.lambda.id
}
