import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Redis, type RedisOptions } from 'ioredis';

import { loadEnv } from '../../config/env';

/**
 * Composition over inheritance: this service holds an ioredis client and
 * exposes a small surface (ping + get/set/del) plus `getClient()` for callers
 * that need raw access (BullMQ in session 1.9, pub/sub in session 1.10).
 *
 * Boot semantics: lazyConnect=true means no socket is opened in the
 * constructor; `await this.client.connect()` runs in `onModuleInit`. A
 * connection failure there fails the Nest boot — fail-fast (CLAUDE.md §3.7
 * spirit: surface infra problems early, don't accept traffic with broken
 * dependencies). After a successful boot, ioredis handles reconnection
 * automatically per its retry strategy.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor() {
    const env = loadEnv();
    const options: RedisOptions = {
      lazyConnect: true,
      // Bound retries per request so callers don't hang forever if the cluster
      // is down — the bullmq path will override this anyway.
      maxRetriesPerRequest: 3,
      // Backoff up to 2s between reconnect attempts.
      retryStrategy: (times: number) => Math.min(times * 100, 2_000),
    };
    this.client = new Redis(env.REDIS_URL, options);

    // Pino picks these up — useful for noticing reconnects in production.
    this.client.on('error', (err) => this.logger.warn(`redis error: ${err.message}`));
    this.client.on('reconnecting', () => this.logger.log('redis reconnecting'));
    this.client.on('ready', () => this.logger.log('redis ready'));
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
  }

  async onModuleDestroy(): Promise<void> {
    // quit() drains pending commands and closes cleanly. disconnect() would
    // be abrupt; quit is correct for graceful shutdown.
    await this.client.quit();
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Returns the raw ioredis client. Use only when you need pub/sub, BullMQ,
   * or commands not exposed by the convenience methods below.
   */
  getClient(): Redis {
    return this.client;
  }

  /**
   * Pings Redis and returns the round-trip latency in milliseconds.
   * Throws when the server is unreachable.
   */
  async ping(): Promise<number> {
    const start = Date.now();
    await this.client.ping();
    return Date.now() - start;
  }

  get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds !== undefined) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  del(key: string): Promise<number> {
    return this.client.del(key);
  }
}
