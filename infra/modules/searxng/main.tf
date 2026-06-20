locals {
  name = "${var.project_name}-${var.environment}-searxng"

  # Two AZs for ALB (requires >=2 subnets). Single NAT gateway to keep cost down.
  az_count = 2

  public_subnet_cidrs  = [cidrsubnet(var.vpc_cidr, 8, 0), cidrsubnet(var.vpc_cidr, 8, 1)]
  private_subnet_cidrs = [cidrsubnet(var.vpc_cidr, 8, 10), cidrsubnet(var.vpc_cidr, 8, 11)]

  container_port = 8080

  # Minimal settings.yml: keep upstream defaults, enable the JSON API, disable the
  # bot limiter (this instance is reachable only from the VPC), and inject a
  # generated secret_key. Written by an init container into a shared volume so we
  # never have to build/push a custom image.
  settings_yaml = <<-YAML
    use_default_settings: true
    server:
      secret_key: "${random_password.secret_key.result}"
      limiter: false
      public_instance: false
    search:
      formats:
        - html
        - json
  YAML
}

data "aws_availability_zones" "available" {
  state = "available"
}

resource "random_password" "secret_key" {
  length  = 32
  special = false
}

# ============================================================
# VPC + subnets + routing
# ============================================================

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = "${local.name}-vpc" }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = "${local.name}-igw" }
}

resource "aws_subnet" "public" {
  count                   = local.az_count
  vpc_id                  = aws_vpc.this.id
  cidr_block              = local.public_subnet_cidrs[count.index]
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true
  tags                    = { Name = "${local.name}-public-${count.index}" }
}

resource "aws_subnet" "private" {
  count             = local.az_count
  vpc_id            = aws_vpc.this.id
  cidr_block        = local.private_subnet_cidrs[count.index]
  availability_zone = data.aws_availability_zones.available.names[count.index]
  tags              = { Name = "${local.name}-private-${count.index}" }
}

resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = { Name = "${local.name}-nat-eip" }
}

# Single NAT gateway (in the first public subnet) shared by both private subnets.
resource "aws_nat_gateway" "this" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id
  tags          = { Name = "${local.name}-nat" }
  depends_on    = [aws_internet_gateway.this]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }
  tags = { Name = "${local.name}-public-rt" }
}

resource "aws_route_table_association" "public" {
  count          = local.az_count
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.this.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.this.id
  }
  tags = { Name = "${local.name}-private-rt" }
}

resource "aws_route_table_association" "private" {
  count          = local.az_count
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# ============================================================
# Security groups
# ============================================================

# The Lambda tool ENI. Egress-only; the ALB SG trusts this SG on :80.
resource "aws_security_group" "lambda" {
  name        = "${local.name}-lambda-sg"
  description = "SearXNG tool Lambda ENI"
  vpc_id      = aws_vpc.this.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name}-lambda-sg" }
}

# Internal ALB. Accepts :80 only from the Lambda SG.
resource "aws_security_group" "alb" {
  name        = "${local.name}-alb-sg"
  description = "SearXNG internal ALB"
  vpc_id      = aws_vpc.this.id

  ingress {
    description     = "HTTP from SearXNG tool Lambda"
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name}-alb-sg" }
}

# Fargate task. Accepts the container port only from the ALB SG.
resource "aws_security_group" "fargate" {
  name        = "${local.name}-fargate-sg"
  description = "SearXNG Fargate task"
  vpc_id      = aws_vpc.this.id

  ingress {
    description     = "Container port from ALB"
    from_port       = local.container_port
    to_port         = local.container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name}-fargate-sg" }
}

# ============================================================
# Internal ALB
# ============================================================

resource "aws_lb" "this" {
  name               = local.name
  internal           = true
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.private[*].id
  tags               = { Name = local.name }
}

resource "aws_lb_target_group" "this" {
  name        = local.name
  port        = local.container_port
  protocol    = "HTTP"
  vpc_id      = aws_vpc.this.id
  target_type = "ip"

  health_check {
    path                = "/healthz"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = { Name = local.name }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.this.arn
  }
}

# ============================================================
# ECS Fargate
# ============================================================

resource "aws_ecs_cluster" "this" {
  name = local.name
}

resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${local.name}"
  retention_in_days = var.log_retention_days
}

# Task execution role: pull image + write logs.
resource "aws_iam_role" "task_execution" {
  name = "${local.name}-task-exec-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "task_execution" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_ecs_task_definition" "this" {
  family                   = local.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.fargate_cpu
  memory                   = var.fargate_memory
  execution_role_arn       = aws_iam_role.task_execution.arn

  # Ephemeral shared volume that the init container populates with settings.yml.
  volume {
    name = "searxng-config"
  }

  container_definitions = jsonencode([
    {
      # Writes /etc/searxng/settings.yml then exits; searxng waits for it.
      name      = "config-init"
      image     = "public.ecr.aws/docker/library/busybox:stable"
      essential = false
      command = [
        "sh", "-c",
        "printf '%s' \"$SEARXNG_SETTINGS\" > /etc/searxng/settings.yml",
      ]
      environment = [
        { name = "SEARXNG_SETTINGS", value = local.settings_yaml },
      ]
      mountPoints = [
        { sourceVolume = "searxng-config", containerPath = "/etc/searxng" },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "config-init"
        }
      }
    },
    {
      name      = "searxng"
      image     = var.searxng_image
      essential = true
      dependsOn = [
        { containerName = "config-init", condition = "COMPLETE" },
      ]
      portMappings = [
        { containerPort = local.container_port, protocol = "tcp" },
      ]
      mountPoints = [
        { sourceVolume = "searxng-config", containerPath = "/etc/searxng" },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "searxng"
        }
      }
    },
  ])
}

resource "aws_ecs_service" "this" {
  name            = local.name
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.this.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = aws_subnet.private[*].id
    security_groups = [aws_security_group.fargate.id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.this.arn
    container_name   = "searxng"
    container_port   = local.container_port
  }

  # Block apply until the task is healthy behind the ALB so the gateway target
  # is only created once the instance can actually serve requests.
  wait_for_steady_state = true

  depends_on = [aws_lb_listener.http]
}
