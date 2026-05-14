import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { RedisService } from '../../shared/redis/redis.service';
import { POSITIONS_CHANNEL_PATTERN, eventIdFromChannel } from './dto/realtime.dto';
import { RealtimeGateway } from './realtime.gateway';

/**
 * Subscribes to Redis pub/sub `event:*:positions` and forwards each message
 * to the matching socket.io room via the gateway. A subscriber connection is
 * dedicated (not the BullMQ/RedisService client) because pub/sub mode locks
 * the connection from running normal commands.
 */
@Injectable()
export class RealtimeSubscriber implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeSubscriber.name);
  private subscriber?: Redis;

  constructor(
    private readonly redis: RedisService,
    private readonly gateway: RealtimeGateway,
  ) {}

  async onModuleInit(): Promise<void> {
    this.subscriber = this.redis.getClient().duplicate();
    await this.subscriber.connect();

    this.subscriber.on('pmessage', (_pattern: string, channel: string, message: string) => {
      this.dispatch(channel, message);
    });

    await this.subscriber.psubscribe(POSITIONS_CHANNEL_PATTERN);
    this.logger.log(`subscribed to ${POSITIONS_CHANNEL_PATTERN}`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = undefined;
    }
  }

  private dispatch(channel: string, message: string): void {
    const eventId = eventIdFromChannel(channel);
    if (!eventId) {
      this.logger.warn({ channel }, 'unrecognized channel');
      return;
    }
    let payload: unknown;
    try {
      payload = JSON.parse(message);
    } catch (err) {
      this.logger.warn(
        { channel, error: err instanceof Error ? err.message : err },
        'invalid JSON on realtime channel',
      );
      return;
    }
    this.gateway.broadcastPosition(eventId, payload);
  }
}
