import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { PrismaService } from '../../shared/database/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import { NotificationTarget } from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';

/**
 * Bridges mission-engine (1.13) to the notifications dispatcher.
 *
 * Listens on Redis pub/sub `mission:progress:updated`. When a row hits
 * `state=COMPLETED`, it creates an INDIVIDUAL notification for the operator's
 * user — closing the position -> engine -> push loop described in CLAUDE.md
 * §5.3 ("notifica operadores afetados").
 *
 * Dedicated subscriber connection (pub/sub mode locks the client from running
 * normal commands). Failures are logged but never propagated — the canonical
 * mission progress already lives in Postgres.
 */
@Injectable()
export class NotificationsMissionListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsMissionListener.name);
  private subscriber?: Redis;

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.subscriber = this.redis.getClient().duplicate();
    await this.subscriber.connect();
    this.subscriber.on('message', (channel: string, message: string) => {
      void this.dispatch(channel, message);
    });
    await this.subscriber.subscribe('mission:progress:updated');
    this.logger.log('subscribed to mission:progress:updated');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = undefined;
    }
  }

  private async dispatch(channel: string, message: string): Promise<void> {
    if (channel !== 'mission:progress:updated') return;

    let payload: { missionId: string; operatorId: string; state: string };
    try {
      payload = JSON.parse(message) as typeof payload;
    } catch (err) {
      this.logger.warn(
        { error: err instanceof Error ? err.message : err },
        'invalid JSON on mission:progress:updated',
      );
      return;
    }

    if (payload.state !== 'COMPLETED') return;

    try {
      const operator = await this.prisma.operator.findUnique({
        where: { id: payload.operatorId },
        select: { userId: true },
      });
      const mission = await this.prisma.mission.findUnique({
        where: { id: payload.missionId },
        select: { name: true, pointsReward: true },
      });
      if (!operator || !mission) return;

      await this.notifications.create(
        {
          target: NotificationTarget.INDIVIDUAL,
          targetId: operator.userId,
          title: 'Mission completed',
          body: `${mission.name} (+${mission.pointsReward} pts)`,
        },
        null, // system-generated
      );
    } catch (err) {
      this.logger.warn(
        {
          missionId: payload.missionId,
          operatorId: payload.operatorId,
          error: err instanceof Error ? err.message : err,
        },
        'failed to create mission-completed notification',
      );
    }
  }
}
