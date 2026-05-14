# ORYX — Infraestrutura (Terraform)

Toda a infra AWS do ORYX é gerida aqui. CLAUDE.md §2 prescreve `sa-east-1`,
ECS Fargate, RDS PostgreSQL 16 (PostGIS), ElastiCache Redis 7 e AWS IoT Core.

## O que está provisionado nesta sessão (0.5)

- **VPC** `10.0.0.0/16` com 2 AZs, subnets públicas (`10.0.0.0/24`,
  `10.0.1.0/24`) e privadas (`10.0.10.0/24`, `10.0.11.0/24`), Internet
  Gateway e **um único** NAT Gateway (custo dev — prod precisa 2).
- **RDS PostgreSQL 16** `db.t4g.micro`, 20 GB gp3, encryption at-rest,
  IAM auth desligada (vem na sessão 4.x), senha master gerada por
  `random_password` e parqueada em Secrets Manager.
- **ElastiCache Redis 7** `cache.t4g.micro`, 1 nó (sem réplica em dev),
  encryption at-rest e in-transit, AUTH token em Secrets Manager.
- **ECS Fargate cluster** vazio. Tasks/services chegam na sessão 4.5.
- **AWS IoT Core**: `aws_iot_thing_type` para operadores e uma policy
  template para conexão MQTTS dos clientes mobile (sessão 1.8 emite
  certificados temporários a partir dessa policy).

## O que NÃO está provisionado (sessões futuras)

- Route 53, ACM, CloudFront, S3 (assets) — sessões 4.x.
- IAM roles para task execution detalhados — sessão 4.5 com primeiro service.
- ALB / NLB — sessão 4.5.
- CloudWatch alarms / dashboards — sessão 4.4.

## Bootstrap — primeira vez

Esta sessão valida apenas a config (sem `apply`). Quando você for aplicar:

1. **Crie o backend remoto manualmente** (galinha-e-ovo conhecido):
   ```bash
   aws s3api create-bucket \
     --bucket oryx-tf-state-<account-id> \
     --region sa-east-1 \
     --create-bucket-configuration LocationConstraint=sa-east-1
   aws s3api put-bucket-versioning \
     --bucket oryx-tf-state-<account-id> \
     --versioning-configuration Status=Enabled
   aws s3api put-bucket-encryption \
     --bucket oryx-tf-state-<account-id> \
     --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
   aws dynamodb create-table \
     --table-name oryx-tf-locks \
     --attribute-definitions AttributeName=LockID,AttributeType=S \
     --key-schema AttributeName=LockID,KeyType=HASH \
     --billing-mode PAY_PER_REQUEST \
     --region sa-east-1
   ```

2. **Descomente o bloco `backend "s3"`** em `main.tf` e preencha o nome do
   bucket. Em seguida:
   ```bash
   terraform init -migrate-state
   ```

3. **Aplique** (revise o plan antes — recursos custam dinheiro):
   ```bash
   terraform plan -out plan.out
   terraform apply plan.out
   ```

## Custo aproximado (dev, single-AZ, sa-east-1)

| Recurso        | Mês (USD) |
|----------------|-----------|
| NAT Gateway    | ~32       |
| RDS t4g.micro  | ~11       |
| Redis t4g.micro| ~10       |
| RDS storage 20G| ~2        |
| **Total dev**  | **~55**   |

ECS sem tasks = $0. IoT Core cobra por mensagem/conexão (centavos para dev).

## Variáveis sensíveis

Nunca colocar em `.tfvars` versionado. Usar `TF_VAR_<nome>`:
```bash
TF_VAR_environment=staging terraform plan
```
