# ORYX Backend

NestJS backend for ORYX with Prisma, PostgreSQL/PostGIS, Redis, BullMQ, JWT auth, realtime sockets, MQTT credential stubs, notification stubs and voice token stubs.

## Requirements

- Node.js 20+
- npm
- Docker Desktop for local PostgreSQL/PostGIS and Redis

## Local Setup

```powershell
npm install
npm run db:generate
Copy-Item .env.example .env
```

Update `.env` secrets before running the API. For local infrastructure:

```powershell
docker compose up -d
npm run db:migrate
npm run db:seed
npm run start:dev
```

API health check:

```text
GET http://localhost:3000/health
```

## Quality Checks

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

## Production Environment

Use `.env.production.example` as the deployment checklist. Required variables:

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`

Keep secrets in the deployment platform secret manager. Do not commit `.env`.

## Docker

Build the production image:

```powershell
docker build -t oryx-backend .
```

Run it:

```powershell
docker run --env-file .env -p 3000:3000 oryx-backend
```

Run database migrations before starting production traffic:

```powershell
npm run db:migrate
```

## Deploy Path

Cloudflare should manage DNS, SSL and proxying. The backend itself should run on AWS or another Node-compatible host.

Recommended final AWS path:

- ECS Fargate for the API container
- RDS PostgreSQL 16 with PostGIS
- ElastiCache Redis 7
- Cloudflare DNS pointing `api.<domain>` to the AWS load balancer

The `infra/` directory already contains the Terraform foundation for AWS.
