# AWS CloudShell Runbook

Use this from AWS CloudShell in account `368763425828`, region `sa-east-1`.

## 1. Install Terraform

```bash
cd ~
curl -fsSLo terraform.zip https://releases.hashicorp.com/terraform/1.10.5/terraform_1.10.5_linux_amd64.zip
unzip -o terraform.zip
mkdir -p ~/bin
mv terraform ~/bin/terraform
export PATH="$HOME/bin:$PATH"
terraform -version
```

## 2. Clone The Repository

```bash
cd ~
rm -rf oryx-backend1
git clone https://github.com/contatoanimalzent-create/oryx-backend1.git
cd oryx-backend1
```

## 3. Create ECR First

Terraform owns the ECR repo, but the image must exist before the ECS service can run.

```bash
cd ~/oryx-backend1/infra
terraform init -backend=false
terraform apply \
  -target=aws_ecr_repository.api \
  -target=aws_ecr_lifecycle_policy.api \
  -var='api_image_uri=placeholder' \
  -auto-approve
```

## 4. Build And Push The Image

```bash
cd ~/oryx-backend1
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=sa-east-1
IMAGE="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/oryx-backend:latest"

aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

docker build -t oryx-backend .
docker tag oryx-backend:latest "$IMAGE"
docker push "$IMAGE"
```

## 5. Create AWS Infrastructure And Deploy API

```bash
cd ~/oryx-backend1/infra
terraform apply -var="api_image_uri=$IMAGE" -auto-approve
```

This creates:

- VPC
- public/private subnets
- NAT Gateway
- RDS PostgreSQL 16
- ElastiCache Redis 7
- ECR
- ECS Fargate
- ALB
- Secrets Manager env secret
- CloudWatch logs

## 6. Run Database Migrations In ECS

```bash
CLUSTER=$(terraform output -raw ecs_cluster_name)
TASK_DEF=$(terraform output -raw api_task_definition_arn)
SUBNETS=$(terraform output -json private_subnet_ids | jq -r 'join(",")')
SG=$(terraform output -raw ecs_security_group_id)

aws ecs run-task \
  --cluster "$CLUSTER" \
  --launch-type FARGATE \
  --task-definition "$TASK_DEF" \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SG],assignPublicIp=DISABLED}" \
  --overrides '{"containerOverrides":[{"name":"api","command":["npm","run","db:migrate"]}]}'
```

## 7. Get The API URL

```bash
terraform output api_health_url
terraform output api_load_balancer_dns_name
```

Cloudflare DNS:

```text
Type: CNAME
Name: api
Target: <api_load_balancer_dns_name>
Proxy: enabled
```

Final URL:

```text
https://api.oryxcontrol.com/health
```

