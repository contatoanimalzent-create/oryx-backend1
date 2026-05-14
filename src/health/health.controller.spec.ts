import { describe, expect, it, vi } from 'vitest';

import type { RedisService } from '../shared/redis/redis.service';
import { HealthController } from './health.controller';

function makeController(redis: Partial<RedisService>): HealthController {
  return new HealthController(redis as RedisService);
}

describe('HealthController', () => {
  it('returns ok status', async () => {
    const controller = makeController({ ping: vi.fn().mockResolvedValue(2) });
    const result = await controller.check();
    expect(result.status).toBe('ok');
  });

  it('returns ISO 8601 timestamp', async () => {
    const controller = makeController({ ping: vi.fn().mockResolvedValue(1) });
    const result = await controller.check();
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(new Date(result.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('returns non-negative uptime', async () => {
    const controller = makeController({ ping: vi.fn().mockResolvedValue(1) });
    const result = await controller.check();
    expect(result.uptime).toBeGreaterThanOrEqual(0);
  });

  it('reports redis ok with latency when ping resolves', async () => {
    const controller = makeController({ ping: vi.fn().mockResolvedValue(7) });
    const result = await controller.check();
    expect(result.redis.status).toBe('ok');
    expect(result.redis.latencyMs).toBe(7);
    expect(result.redis.error).toBeUndefined();
  });

  it('reports redis down with error when ping rejects', async () => {
    const controller = makeController({
      ping: vi.fn().mockRejectedValue(new Error('connection refused')),
    });
    const result = await controller.check();
    expect(result.redis.status).toBe('down');
    expect(result.redis.error).toBe('connection refused');
    expect(result.redis.latencyMs).toBeUndefined();
  });

  it('reports redis down on ping timeout', async () => {
    const controller = makeController({
      ping: vi.fn().mockImplementation(() => new Promise(() => undefined)),
    });
    const result = await controller.check();
    expect(result.redis.status).toBe('down');
    expect(result.redis.error).toMatch(/timeout/);
  });
});
