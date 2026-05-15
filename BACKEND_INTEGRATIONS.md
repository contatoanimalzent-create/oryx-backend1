# 🔌 Plugar integrações externas — ORYX Backend

Todas as 4 integrações externas (Sentry, LiveKit, FCM, AWS IoT/MQTT) **já estão implementadas no código** desde 2026-05-15. Só falta setar as variáveis de ambiente no `.env` real (não-commitado).

## ⚙️ Sentry — crash reporting

Já configurado no [`src/main.ts`](./src/main.ts) e [`src/sentry/`](./src/sentry). Ignora 4xx (client errors) e envia 5xx + exceptions de boot.

### Setar no `.env`:
```env
SENTRY_DSN=https://210abead0906ee2478e69c85dbf5154a@o4511267865231360.ingest.us.sentry.io/4511269849464832
SENTRY_TRACES_SAMPLE_RATE=0.1
SENTRY_PROFILES_SAMPLE_RATE=0.1
```

### Validar:
```bash
npm install   # instala @sentry/node + @sentry/profiling-node
npm run start:dev
# Forçar 500: curl http://localhost:3000/some-endpoint-that-throws
# Conferir https://animalz-group.sentry.io/issues/
```

---

## 🎙️ LiveKit — voz tempo real

Implementado em [`src/modules/voice/voice.service.ts:217-251`](./src/modules/voice/voice.service.ts). Assina HS256 via `livekit-server-sdk` (já no `package.json`).

### Setar no `.env`:
```env
VOICE_MODE=livekit
VOICE_TOKEN_TTL_SECONDS=3600
LIVEKIT_URL=wss://oryx-vrw0ssg8.livekit.cloud
LIVEKIT_API_KEY=APIQPQKPtjqpWQP
LIVEKIT_API_SECRET=8ylk8aHTjyUcchSb6EyW6ypvm1hRKLhEhZBTL8vECIF
```

### Validar:
```bash
# Squad voice token (operador na squad ACTIVE de evento ACTIVE)
curl -X POST http://localhost:3000/voice/tokens \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"channel":"SQUAD","channelId":"<squadId>"}'
# Response.mode deve ser "livekit" (não "stub")
```

---

## 🔔 FCM — push notifications

Implementado em [`src/modules/notifications/notifications.processor.ts:66-104`](./src/modules/notifications/notifications.processor.ts). Usa `firebase-admin` (já no `package.json`), inclusive cleanup de tokens inválidos.

### 1. Gerar Service Account JSON no Firebase

1. https://console.firebase.google.com/project/oryx-control/settings/serviceaccounts/adminsdk
2. Clica **"Gerar nova chave privada"** → baixa um JSON
3. Salva em local seguro (ex: `~/.secrets/oryx-fcm-sa.json` no servidor de produção)
4. **NUNCA commitar esse arquivo** — contém credenciais de admin do projeto Firebase inteiro

### 2. Setar no `.env`:

**Opção A — arquivo no disco** (mais seguro, recomendado prod):
```env
NOTIFICATIONS_MODE=fcm
FCM_PROJECT_ID=oryx-control
FCM_CREDENTIALS_JSON=$(cat ~/.secrets/oryx-fcm-sa.json)
```

**Opção B — JSON inline** (mais simples pra dev/staging):
```env
NOTIFICATIONS_MODE=fcm
FCM_PROJECT_ID=oryx-control
FCM_CREDENTIALS_JSON={"type":"service_account","project_id":"oryx-control","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"firebase-adminsdk-xxx@oryx-control.iam.gserviceaccount.com","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}
```

> ⚠️ A `private_key` tem `\n` literais — manter como string única numa linha sem quebrar.

### Validar:
```bash
# Mobile registra token via splash; depois disparar uma notification:
curl -X POST http://localhost:3000/notifications \
  -H "Authorization: Bearer <JWT_ADMIN>" \
  -H "Content-Type: application/json" \
  -d '{"target":"OPERATOR","targetId":"<operatorId>","title":"Teste","body":"Push real funcionando"}'
# Conferir BullMQ job + celular recebe push
```

---

## 📡 MQTT — AWS IoT Core

Implementado em [`src/modules/mqtt/mqtt.service.ts:78-134`](./src/modules/mqtt/mqtt.service.ts). Usa `@aws-sdk/client-sts` (já no `package.json`) pra emitir credenciais STS scoped por operador.

### Pré-requisitos AWS:
1. Conta AWS ativa
2. AWS IoT Core endpoint criado em `sa-east-1` (Brasil)
3. IAM Role com policy permitindo `iot:Connect` + `iot:Publish` no padrão `oryx/positions/<eventId>/<operatorId>/*`

### Setar no `.env`:
```env
MQTT_MODE=aws
MQTT_CREDENTIAL_TTL_SECONDS=3600
AWS_REGION=sa-east-1
AWS_IOT_ENDPOINT=a1b2c3d4-ats.iot.sa-east-1.amazonaws.com
AWS_IOT_ROLE_ARN=arn:aws:iam::ACCOUNT_ID:role/oryx-iot-credentials

# Credenciais base do role (perfil AWS CLI ou IAM user):
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
```

### Alternativa: HiveMQ Cloud (mais simples, sem AWS)

A implementação atual é AWS-only. Se quiser HiveMQ Cloud (free 100 connections):
1. Sign up em https://www.hivemq.com/mqtt-cloud-broker/
2. Vai precisar de novo módulo backend `MqttHivemqService` ou estender o atual com `MQTT_MODE=hivemq`
3. Avise que eu implemento.

---

## 📋 Resumo — o que setar em produção

| Variável | Valor | Onde pegar |
|---|---|---|
| `SENTRY_DSN` | `https://210abead...sentry.io/4511269849464832` | já temos |
| `VOICE_MODE` | `livekit` | — |
| `LIVEKIT_URL` | `wss://oryx-vrw0ssg8.livekit.cloud` | já temos |
| `LIVEKIT_API_KEY` | `APIQPQKPtjqpWQP` | já temos |
| `LIVEKIT_API_SECRET` | `8ylk8aHTjyUcchSb6EyW6ypvm1hRKLhEhZBTL8vECIF` | já temos |
| `NOTIFICATIONS_MODE` | `fcm` | — |
| `FCM_PROJECT_ID` | `oryx-control` | já temos |
| `FCM_CREDENTIALS_JSON` | `{...}` | **gerar agora no Firebase Console** ⬆️ |
| `MQTT_MODE` | `aws` | — |
| `AWS_IOT_ENDPOINT` | seu endpoint AWS IoT | **criar conta AWS + IoT Core** |
| `AWS_IOT_ROLE_ARN` | arn do IAM role | **criar IAM role** |
| `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` | IAM user com `sts:AssumeRole` no role | **criar IAM user** |

## Ordem recomendada

1. ✅ **Sentry** (1 min — só copiar DSN)
2. ✅ **LiveKit** (1 min — 3 vars)
3. ✅ **FCM** (~5 min — gerar Service Account no Firebase)
4. ⏳ **MQTT** (~30 min se AWS — criar conta + IoT + IAM role)
