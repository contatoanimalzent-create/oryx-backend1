import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_ENV = {
  NODE_ENV: 'test',
  PORT: '3000',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://x:x@localhost:5432/x',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL: '30d',
};

interface FakeClient {
  connect: ReturnType<typeof vi.fn>;
  quit: ReturnType<typeof vi.fn>;
  ping: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
}

let lastClient: FakeClient | undefined;

vi.mock('ioredis', () => {
  return {
    Redis: vi.fn().mockImplementation(() => {
      lastClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        quit: vi.fn().mockResolvedValue('OK'),
        ping: vi.fn().mockResolvedValue('PONG'),
        get: vi.fn().mockResolvedValue('value'),
        set: vi.fn().mockResolvedValue('OK'),
        del: vi.fn().mockResolvedValue(1),
        on: vi.fn().mockReturnThis(),
      };
      return lastClient;
    }),
  };
});

describe('RedisService', () => {
  beforeAll(() => {
    Object.assign(process.env, TEST_ENV);
  });

  beforeEach(() => {
    lastClient = undefined;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('connects on onModuleInit', async () => {
    const { RedisService } = await import('./redis.service');
    const svc = new RedisService();
    expect(lastClient?.connect).not.toHaveBeenCalled();
    await svc.onModuleInit();
    expect(lastClient?.connect).toHaveBeenCalledOnce();
  });

  it('quits on onModuleDestroy (graceful)', async () => {
    const { RedisService } = await import('./redis.service');
    const svc = new RedisService();
    await svc.onModuleDestroy();
    expect(lastClient?.quit).toHaveBeenCalledOnce();
  });

  it('ping() returns latency in ms', async () => {
    const { RedisService } = await import('./redis.service');
    const svc = new RedisService();
    const latency = await svc.ping();
    expect(latency).toBeGreaterThanOrEqual(0);
    expect(lastClient?.ping).toHaveBeenCalledOnce();
  });

  it('set without ttl uses plain SET', async () => {
    const { RedisService } = await import('./redis.service');
    const svc = new RedisService();
    await svc.set('k', 'v');
    expect(lastClient?.set).toHaveBeenCalledWith('k', 'v');
  });

  it('set with ttl uses EX argument', async () => {
    const { RedisService } = await import('./redis.service');
    const svc = new RedisService();
    await svc.set('k', 'v', 60);
    expect(lastClient?.set).toHaveBeenCalledWith('k', 'v', 'EX', 60);
  });

  it('exposes raw client via getClient', async () => {
    const { RedisService } = await import('./redis.service');
    const svc = new RedisService();
    expect(svc.getClient()).toBe(lastClient);
  });
});
