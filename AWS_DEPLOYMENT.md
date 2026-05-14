# ORYX AWS Deployment

This is the deployment path for taking the backend from GitHub to AWS, with Cloudflare in front of the API domain.

## Current Repository

GitHub:

```text
https://github.com/contatoanimalzent-create/oryx-backend1
```

Main branch:

```text
main
```

For the exact copy/paste flow inside AWS CloudShell, use [AWS_CLOUDSHELL_RUNBOOK.md](AWS_CLOUDSHELL_RUNBOOK.md).

## Target Architecture

- GitHub stores the source code.
- Docker builds the backend image from `Dockerfile`.
- AWS runs the backend.
- RDS PostgreSQL 16 with PostGIS stores application data.
- ElastiCache Redis 7 supports queues, realtime and cache flows.
- Cloudflare manages DNS, SSL and proxying for the public API hostname.

Recommended hostname:

```text
api.<your-domain>
```

## Production Variables

Use `.env.production.example` as the source checklist. At minimum, production needs:

```text
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://...
REDIS_URL=rediss://...
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d
MQTT_MODE=stub
NOTIFICATIONS_MODE=stub
VOICE_MODE=stub
AWS_REGION=sa-east-1
```

Generate JWT secrets with:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Generate two different values, one for access and one for refresh.

## Phase 1: Prepare AWS

1. Choose the AWS account and confirm region:

```text
sa-east-1
```

2. Create the Terraform remote state bucket and lock table. See [infra/README.md](infra/README.md).

3. Configure AWS credentials locally or in CI.

4. From `infra/`, validate:

```powershell
terraform init -backend=false
terraform fmt -check -recursive
terraform validate
```

5. When ready to actually create resources, configure the S3 backend in `infra/main.tf`, then run:

```powershell
terraform init -migrate-state
terraform plan -out plan.out
terraform apply plan.out
```

## Phase 2: Build Backend Image

From the repository root:

```powershell
docker build -t oryx-backend .
```

For AWS ECS, push the image to ECR:

```powershell
aws ecr create-repository --repository-name oryx-backend --region sa-east-1
aws ecr get-login-password --region sa-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.sa-east-1.amazonaws.com
docker tag oryx-backend:latest <account-id>.dkr.ecr.sa-east-1.amazonaws.com/oryx-backend:latest
docker push <account-id>.dkr.ecr.sa-east-1.amazonaws.com/oryx-backend:latest
```

## Phase 3: Database

After RDS exists and `DATABASE_URL` is available, run migrations once:

```powershell
npm run db:migrate
```

Optional seed:

```powershell
npm run db:seed
```

In production, run migrations from a controlled one-off task, not from every API container boot.

## Phase 4: Run API

The API process is:

```text
node dist/main.js
```

The Docker image already uses that command.

Health endpoint:

```text
GET /health
```

Expected public URL after DNS:

```text
https://api.<your-domain>/health
```

## Phase 5: Cloudflare

In Cloudflare DNS, create:

```text
Type: CNAME
Name: api
Target: <aws-load-balancer-dns-name>
Proxy: enabled
```

Use SSL/TLS mode:

```text
Full or Full (strict)
```

Use Full (strict) when the AWS load balancer has a valid certificate.

## Final Checks

Before considering deployment done:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

Then verify:

```text
https://api.<your-domain>/health
```
