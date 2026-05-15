import { Controller, Get } from '@nestjs/common';

import { PrismaService } from '../shared/database/prisma.service';
import { RedisService } from '../shared/redis/redis.service';

interface DependencyStatus {
  status: 'ok' | 'down';
  latencyMs?: number;
  error?: string;
}

export interface HealthStatus {
  status: 'ok';
  timestamp: string;
  uptime: number;
  db: DependencyStatus;
  redis: DependencyStatus;
  queue: DependencyStatus;
}

const PING_TIMEOUT_MS = 1_000;

@Controller('health')
export class HealthController {
  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async check(): Promise<HealthStatus> {
    const [db, redis, queue] = await Promise.all([
      this.checkDb(),
      this.checkRedis(),
      this.checkQueue(),
    ]);

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      db,
      redis,
      queue,
    };
  }

  @Get('db')
  db(): Promise<DependencyStatus> {
    return this.checkDb();
  }

  @Get('redis')
  redisStatus(): Promise<DependencyStatus> {
    return this.checkRedis();
  }

  @Get('queue')
  queue(): Promise<DependencyStatus> {
    return this.checkQueue();
  }

  private async checkDb(): Promise<DependencyStatus> {
    const start = Date.now();
    try {
      await this.withTimeout(this.prisma.$queryRaw`SELECT 1`, PING_TIMEOUT_MS);
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch (err) {
      return {
        status: 'down',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async checkRedis(): Promise<DependencyStatus> {
    try {
      const latencyMs = await this.withTimeout(this.redis.ping(), PING_TIMEOUT_MS);
      return { status: 'ok', latencyMs };
    } catch (err) {
      return {
        status: 'down',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async checkQueue(): Promise<DependencyStatus> {
    const start = Date.now();
    try {
      await this.withTimeout(this.redis.getClient().info('server'), PING_TIMEOUT_MS);
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch (err) {
      return {
        status: 'down',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms),
      ),
    ]);
  }
}
