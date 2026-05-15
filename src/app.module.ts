import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { loadEnv } from './config/env';
import { HealthController } from './health/health.controller';
import { AarModule } from './modules/aar/aar.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AntiCheatModule } from './modules/anti-cheat/anti-cheat.module';
import { AuthModule } from './modules/auth/auth.module';
import { CompetitiveModule } from './modules/competitive/competitive.module';
import { EventsModule } from './modules/events/events.module';
import { MissionEngineModule } from './modules/mission-engine/mission-engine.module';
import { MissionsModule } from './modules/missions/missions.module';
import { MqttModule } from './modules/mqtt/mqtt.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OperatorsModule } from './modules/operators/operators.module';
import { PositionsModule } from './modules/positions/positions.module';
import { RankingModule } from './modules/ranking/ranking.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { ReputationModule } from './modules/reputation/reputation.module';
import { SquadsModule } from './modules/squads/squads.module';
import { TacticalModule } from './modules/tactical/tactical.module';
import { TeamsModule } from './modules/teams/teams.module';
import { VoiceModule } from './modules/voice/voice.module';
import { ZonesModule } from './modules/zones/zones.module';
import { PrismaModule } from './shared/database/prisma.module';
import { RedisModule } from './shared/redis/redis.module';

const env = loadEnv();

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: env.LOG_LEVEL,
        transport:
          env.NODE_ENV === 'development'
            ? { target: 'pino-pretty', options: { singleLine: true, colorize: true } }
            : undefined,
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.password',
            'req.body.refreshToken',
            'req.body.token',
            'req.body.cpf',
            'req.body.documentNumber',
            'res.headers["set-cookie"]',
          ],
          censor: '[REDACTED]',
        },
        customProps: () => ({ service: 'oryx-backend' }),
      },
    }),
    // CLAUDE.md §3.7 — 100 req / 15 min on every public endpoint.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 15 * 60 * 1000, limit: 100 }]),
    // BullMQ shares the Redis already provisioned by RedisModule. Each queue
    // is registered by its feature module (PositionsModule -> positions:ingest).
    BullModule.forRoot({ connection: { url: env.REDIS_URL } }),
    PrismaModule,
    RedisModule,
    AuthModule,
    OperatorsModule,
    EventsModule,
    TeamsModule,
    SquadsModule,
    MqttModule,
    PositionsModule,
    RealtimeModule,
    ZonesModule,
    MissionsModule,
    MissionEngineModule,
    NotificationsModule,
    RankingModule,
    ReputationModule,
    AntiCheatModule,
    VoiceModule,
    AnalyticsModule,
    AarModule,
    TacticalModule,
    CompetitiveModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
