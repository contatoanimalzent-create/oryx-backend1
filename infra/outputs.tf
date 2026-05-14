output "vpc_id" {
  description = "VPC ID. Useful when wiring follow-up resources (services, ALBs, etc)."
  value       = aws_vpc.main.id
}

output "private_subnet_ids" {
  description = "Private subnets — ECS tasks, RDS, Redis live here."
  value       = aws_subnet.private[*].id
}

output "public_subnet_ids" {
  description = "Public subnets — NAT Gateway and (later) ALB live here."
  value       = aws_subnet.public[*].id
}

output "ecs_security_group_id" {
  description = "Security group attached to ECS tasks. Outbound only by default."
  value       = aws_security_group.ecs_tasks.id
}

output "rds_endpoint" {
  description = "RDS writer endpoint."
  value       = aws_db_instance.postgres.endpoint
  sensitive   = true
}

output "rds_credentials_secret_arn" {
  description = "ARN of the Secrets Manager secret holding RDS master credentials."
  value       = aws_secretsmanager_secret.rds_credentials.arn
}

output "redis_primary_endpoint" {
  description = "Redis primary endpoint (writer)."
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
  sensitive   = true
}

output "redis_auth_token_secret_arn" {
  description = "ARN of the Secrets Manager secret holding the Redis AUTH token."
  value       = aws_secretsmanager_secret.redis_auth.arn
}

output "ecs_cluster_arn" {
  description = "ECS Fargate cluster ARN. Services in Fase 1.x attach here."
  value       = aws_ecs_cluster.main.arn
}

output "ecs_cluster_name" {
  description = "ECS Fargate cluster name."
  value       = aws_ecs_cluster.main.name
}

output "ecr_repository_url" {
  description = "ECR repository URL for the backend image."
  value       = aws_ecr_repository.api.repository_url
}

output "api_load_balancer_dns_name" {
  description = "Public ALB DNS name. Point api.oryxcontrol.com to this with a Cloudflare CNAME."
  value       = aws_lb.api.dns_name
}

output "api_health_url" {
  description = "HTTP health check URL for the API before Cloudflare DNS is configured."
  value       = "http://${aws_lb.api.dns_name}/health"
}

output "api_env_secret_arn" {
  description = "Secrets Manager secret used by the API ECS task."
  value       = aws_secretsmanager_secret.api_env.arn
}

output "api_task_definition_arn" {
  description = "ECS task definition ARN for the API."
  value       = aws_ecs_task_definition.api.arn
}

output "iot_thing_type_name" {
  description = "IoT thing type for ORYX operators (mobile devices)."
  value       = aws_iot_thing_type.operator.name
}

output "iot_endpoint" {
  description = "IoT Core data endpoint (used by mobile clients to connect over MQTT/MQTTS)."
  value       = data.aws_iot_endpoint.main.endpoint_address
}
