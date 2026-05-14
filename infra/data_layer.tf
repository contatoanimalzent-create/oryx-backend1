# ─── RDS PostgreSQL 16 (PostGIS) ────────────────────────────────────────────

resource "aws_db_subnet_group" "postgres" {
  name        = "${local.name_prefix}-pg"
  subnet_ids  = aws_subnet.private[*].id
  description = "Private subnets for ORYX RDS PostgreSQL."

  tags = {
    Name = "${local.name_prefix}-pg-subnet-group"
  }
}

resource "random_password" "rds_master" {
  length  = 32
  special = true
  # RDS rejects @, /, " and spaces in master passwords.
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "aws_secretsmanager_secret" "rds_credentials" {
  name        = "${local.name_prefix}/rds/credentials"
  description = "Master credentials for the ORYX RDS PostgreSQL instance."
  # 7 days = the minimum AWS allows; gives you a window to recover if a
  # destroy is run by accident.
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "rds_credentials" {
  secret_id = aws_secretsmanager_secret.rds_credentials.id
  secret_string = jsonencode({
    username = "oryx"
    password = random_password.rds_master.result
  })
}

resource "aws_db_instance" "postgres" {
  identifier     = "${local.name_prefix}-pg"
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.rds_instance_class

  allocated_storage     = var.rds_allocated_storage_gb
  max_allocated_storage = 100
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = "oryx"
  username = "oryx"
  password = random_password.rds_master.result

  db_subnet_group_name   = aws_db_subnet_group.postgres.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  multi_az               = var.rds_multi_az

  backup_retention_period = var.environment == "prod" ? 14 : 7
  backup_window           = "03:00-04:00"
  maintenance_window      = "mon:04:00-mon:05:00"

  performance_insights_enabled          = true
  performance_insights_retention_period = 7

  auto_minor_version_upgrade = true
  apply_immediately          = false
  deletion_protection        = var.environment == "prod"
  skip_final_snapshot        = var.environment != "prod"
  final_snapshot_identifier  = var.environment == "prod" ? "${local.name_prefix}-pg-final" : null

  tags = {
    Name = "${local.name_prefix}-pg"
  }
}

# ─── ElastiCache Redis 7 ────────────────────────────────────────────────────

resource "aws_elasticache_subnet_group" "redis" {
  name       = "${local.name_prefix}-redis"
  subnet_ids = aws_subnet.private[*].id
}

resource "random_password" "redis_auth" {
  length  = 64
  special = false # AUTH token: alphanumeric + a few specials only.
}

resource "aws_secretsmanager_secret" "redis_auth" {
  name                    = "${local.name_prefix}/redis/auth-token"
  description             = "AUTH token for the ORYX ElastiCache Redis replication group."
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "redis_auth" {
  secret_id     = aws_secretsmanager_secret.redis_auth.id
  secret_string = random_password.redis_auth.result
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "${local.name_prefix}-redis"
  description          = "ORYX live state (positions TTL 60s) and BullMQ queues."

  engine         = "redis"
  engine_version = "7.1"
  node_type      = var.redis_node_type
  port           = 6379

  num_cache_clusters = var.redis_num_cache_clusters

  subnet_group_name  = aws_elasticache_subnet_group.redis.name
  security_group_ids = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.redis_auth.result

  automatic_failover_enabled = var.redis_num_cache_clusters > 1
  multi_az_enabled           = var.redis_num_cache_clusters > 1

  snapshot_retention_limit = var.environment == "prod" ? 7 : 1
  snapshot_window          = "05:00-06:00"
  maintenance_window       = "mon:06:00-mon:07:00"

  apply_immediately = false

  tags = {
    Name = "${local.name_prefix}-redis"
  }
}
