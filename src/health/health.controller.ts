import { Controller, Get } from '@nestjs/common';

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
  redis: DependencyStatus;
}

const PING_TIMEOUT_MS = 1_000;

@Controller('health')
export class HealthController {
  constructor(private readonly redis: RedisService) {}

  @Get()
  async check(): Promise<HealthStatus> {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      redis: await this.checkRedis(),
    };
  }

  /**
   * Pings Redis with a short hard timeout so a hung connection cannot stall
   * /health and confuse a load-balancer probe.
   */
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

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms),
      ),
    ]);
  }
}
