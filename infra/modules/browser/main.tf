locals {
  # Browser name pattern allows only [a-zA-Z0-9_] (no hyphens), max 48 chars:
  # ^[a-zA-Z][a-zA-Z0-9_]{0,47}$. project_name may contain hyphens (e.g.
  # "websearch-gw"), so replace them with underscores before composing the name.
  browser_name = replace("${var.project_name}_${var.environment}_browser", "-", "_")
}

resource "aws_bedrockagentcore_browser" "this" {
  name        = local.browser_name
  description = "Managed headless browser for ${var.project_name}"

  network_configuration {
    network_mode = "PUBLIC"
  }

  tags = {
    Component = "browser"
  }
}
