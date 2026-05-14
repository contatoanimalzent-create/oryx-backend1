variable "project" {
  description = "Project name used to prefix resources and as the default tag value."
  type        = string
  default     = "oryx"
}

variable "environment" {
  description = "Deployment environment. Drives sizing, retention, and Multi-AZ defaults."
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod."
  }
}

variable "aws_region" {
  description = "AWS region. CLAUDE.md §2 mandates sa-east-1."
  type        = string
  default     = "sa-east-1"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC. /16 leaves room for many subnets."
  type        = string
  default     = "10.0.0.0/16"
}

variable "rds_instance_class" {
  description = "RDS instance class. db.t4g.micro is the cheapest Graviton option (~US$11/mo)."
  type        = string
  default     = "db.t4g.micro"
}

variable "rds_allocated_storage_gb" {
  description = "RDS storage in GB. gp3 is automatically used above 20 GB."
  type        = number
  default     = 20
}

variable "rds_multi_az" {
  description = "Whether to enable Multi-AZ for RDS. Off in dev to save ~US$11/mo; mandatory in prod."
  type        = bool
  default     = false
}

variable "redis_node_type" {
  description = "ElastiCache node type. cache.t4g.micro fits dev workloads (~US$10/mo)."
  type        = string
  default     = "cache.t4g.micro"
}

variable "redis_num_cache_clusters" {
  description = "Number of nodes in the Redis replication group. 1 = no replica (dev only)."
  type        = number
  default     = 1
}

variable "api_image_uri" {
  description = "Full container image URI to deploy to ECS."
  type        = string
}

variable "api_desired_count" {
  description = "Number of API tasks to run."
  type        = number
  default     = 1
}

variable "api_cpu" {
  description = "Fargate CPU units for the API task."
  type        = number
  default     = 512
}

variable "api_memory" {
  description = "Fargate memory MB for the API task."
  type        = number
  default     = 1024
}

variable "jwt_access_ttl" {
  description = "JWT access token TTL."
  type        = string
  default     = "15m"
}

variable "jwt_refresh_ttl" {
  description = "JWT refresh token TTL."
  type        = string
  default     = "30d"
}

variable "app_log_level" {
  description = "Application log level."
  type        = string
  default     = "info"
}
