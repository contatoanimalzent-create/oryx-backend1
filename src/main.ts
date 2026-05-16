import 'reflect-metadata';
// Sentry must initialise before NestFactory so it captures boot-time errors too.
import { initSentry } from './sentry/sentry';
initSentry();

import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as bodyParser from 'body-parser';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';
import { SentryExceptionFilter } from './sentry/sentry.filter';

function corsOrigin(originConfig: string): true | string[] {
  if (originConfig.trim() === '*') return true;
  return originConfig
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.useGlobalFilters(new SentryExceptionFilter());
  app.enableShutdownHooks();

  // Stripe webhook signature verification needs the EXACT raw bytes.
  // Mount a rawBody-preserving body parser ONLY on /payments/stripe/webhook;
  // the rest of the app keeps the Nest default JSON parser.
  app.use(
    '/payments/stripe/webhook',
    bodyParser.json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.enableCors({
    origin: corsOrigin(env.CORS_ORIGINS),
    credentials: true,
  });

  if (env.SWAGGER_ENABLED) {
    const config = new DocumentBuilder()
      .setTitle('ORYX Backend API')
      .setDescription('Operational backend for ORYX Control mobile/admin clients.')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
  }

  await app.listen(env.PORT, '0.0.0.0');
}

void bootstrap();
