locals {
  # Browser name pattern allows underscores: ^[a-zA-Z][a-zA-Z0-9_]{0,47}$
  browser_name = "${var.project_name}_${var.environment}_browser"
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
