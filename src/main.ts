import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';

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
  app.enableShutdownHooks();
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
