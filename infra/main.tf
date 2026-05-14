terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Remote state lives in S3 + DynamoDB. The bucket and table must be
  # created out-of-band (see README.md "Bootstrap"). Uncomment and fill in
  # the bucket name on first real apply.
  #
  # backend "s3" {
  #   bucket         = "oryx-tf-state-<account-id>"
  #   key            = "infra/terraform.tfstate"
  #   region         = "sa-east-1"
  #   dynamodb_table = "oryx-tf-locks"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.common_tags
  }
}

locals {
  name_prefix = "${var.project}-${var.environment}"

  common_tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# AZs available in the chosen region. Two are required for RDS subnet groups
# and Redis replication groups even when running with one node.
data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

data "aws_region" "current" {}
