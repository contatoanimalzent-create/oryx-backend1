# ─── ECS Fargate Cluster ────────────────────────────────────────────────────
# Cluster only — services and task definitions land in session 4.5
# (deploy automatizado / blue-green) when there's a real container to ship.

resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${local.name_prefix}"
  retention_in_days = var.environment == "prod" ? 90 : 14

  tags = {
    Name = "${local.name_prefix}-ecs-logs"
  }
}

resource "aws_ecs_cluster" "main" {
  name = "${local.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  configuration {
    execute_command_configuration {
      logging = "OVERRIDE"
      log_configuration {
        cloud_watch_log_group_name     = aws_cloudwatch_log_group.ecs.name
        cloud_watch_encryption_enabled = false
      }
    }
  }

  tags = {
    Name = "${local.name_prefix}-cluster"
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    base              = 1
    weight            = 1
    capacity_provider = "FARGATE"
  }
}

# ─── AWS IoT Core ───────────────────────────────────────────────────────────
# Operators connect via MQTTS to publish positions. Session 1.8 issues
# short-lived certificates per operator, attached to the policy declared here.

data "aws_iot_endpoint" "main" {
  endpoint_type = "iot:Data-ATS"
}

resource "aws_iot_thing_type" "operator" {
  name = "${local.name_prefix}-operator"

  properties {
    description = "ORYX field operator (mobile device). One thing per operator account."
  }
}

# Policy template for operator certificates. Session 1.8 may further
# constrain by topic prefix; this is the baseline.
resource "aws_iot_policy" "operator" {
  name = "${local.name_prefix}-operator-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "iot:Connect"
        Resource = "arn:aws:iot:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:client/$${iot:Connection.Thing.ThingName}"
      },
      {
        Effect = "Allow"
        Action = "iot:Publish"
        # Operators publish positions on oryx/positions/{eventId}/{operatorId}.
        # Restrict topic to their own thing name to prevent spoofing.
        Resource = "arn:aws:iot:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:topic/oryx/positions/*/$${iot:Connection.Thing.ThingName}"
      },
      {
        Effect = "Allow"
        Action = "iot:Subscribe"
        # Operators subscribe to events on their event/team channel.
        # Wildcard kept; backend-issued certs further restrict at session 1.8.
        Resource = "arn:aws:iot:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:topicfilter/oryx/events/*"
      },
      {
        Effect   = "Allow"
        Action   = "iot:Receive"
        Resource = "arn:aws:iot:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:topic/oryx/events/*"
      },
    ]
  })
}
