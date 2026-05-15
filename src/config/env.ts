import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGINS: z.string().default('*'),
  SWAGGER_ENABLED: z.coerce.boolean().default(true),
  DATABASE_URL: z
    .string()
    .url()
    .refine((url) => url.startsWith('postgres://') || url.startsWith('postgresql://'), {
      message: 'DATABASE_URL must be a postgres:// or postgresql:// connection string',
    }),

  // Redis: redis:// for plain TCP, rediss:// for TLS (ElastiCache prod).
  REDIS_URL: z
    .string()
    .url()
    .refine((url) => url.startsWith('redis://') || url.startsWith('rediss://'), {
      message: 'REDIS_URL must be a redis:// or rediss:// connection string',
    }),

  // JWT secrets — different keys for access vs refresh so a leaked refresh
  // store cannot mint access tokens, and vice-versa.
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be >= 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be >= 32 chars'),

  // Token TTLs accept the ms-style strings @nestjs/jwt understands ("15m", "30d").
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  PASSWORD_RESET_TTL_SECONDS: z.coerce.number().int().min(300).max(86_400).default(3_600),
  EMAIL_VERIFICATION_TTL_SECONDS: z.coerce.number().int().min(300).max(604_800).default(86_400),

  // MQTT / AWS IoT Core (sessão 1.8). Default mode is `stub` so dev can issue
  // structurally-correct credentials without an AWS account. `aws` mode plugs
  // STS+SigV4 in the deploy session.
  MQTT_MODE: z.enum(['stub', 'aws']).default('stub'),
  MQTT_CREDENTIAL_TTL_SECONDS: z.coerce.number().int().min(60).max(43_200).default(3_600),
  AWS_REGION: z.string().default('sa-east-1'),
  AWS_IOT_ENDPOINT: z.string().optional(),
  AWS_IOT_ROLE_ARN: z.string().optional(),

  // Notifications / FCM (sessão 1.14). Same stub|real pattern as MQTT_MODE —
  // `stub` flips notifications to SENT without calling Firebase; `fcm` will
  // wire firebase-admin in the deploy session.
  NOTIFICATIONS_MODE: z.enum(['stub', 'fcm']).default('stub'),
  FCM_PROJECT_ID: z.string().optional(),
  FCM_CREDENTIALS_JSON: z.string().optional(),

  // Voice / LiveKit (sessão 1.18). `stub` mints a structurally-valid opaque
  // token without importing livekit-server-sdk — keeps dev/CI free of
  // external deps. `livekit` plugs the real HS256-signed JWT in the deploy
  // session.
  VOICE_MODE: z.enum(['stub', 'livekit']).default('stub'),
  VOICE_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(43_200).default(3_600),
  LIVEKIT_URL: z.string().optional(),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function loadEnv(): Env {
  if (cached) return cached;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    // Boot-time failure: log to stderr and exit before accepting any traffic.
    // eslint-disable-next-line no-console
    console.error('Invalid environment variables:', result.error.flatten().fieldErrors);
    process.exit(1);
  }

  cached = result.data;
  return cached;
}
