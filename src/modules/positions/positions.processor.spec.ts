import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../shared/database/prisma.service';
import type { RedisService } from '../../shared/redis/redis.service';
import type { PositionIngestJob } from './dto/positions.dto';
import { PositionsProcessor } from './positions.processor';

const TEST_ENV = {
  NODE_ENV: 'test',
  PORT: '3000',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://x:x@localhost:5432/x',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

const OPERATOR_ID = '22222222-2222-2222-2222-222222222222';
const EVENT_ID = '33333333-3333-3333-3333-333333333333';
const CLIENT_EVENT_ID = '55555555-5555-5555-5555-555555555555';

function makeJob(overrides: Partial<PositionIngestJob> = {}): { data: PositionIngestJob } {
  const recordedAt = '2026-05-03T22:00:00.000Z';
  return {
    data: {
      operatorId: OPERATOR_ID,
      eventId: EVENT_ID,
      lat: -23.55,
      lon: -46.62,
      recordedAt,
      receivedAt: '2026-05-03T22:00:01.000Z',
      clientEventId: CLIENT_EVENT_ID,
      ...overrides,
    },
  };
}

describe('PositionsProcessor', () => {
  let processor: PositionsProcessor;
  let prisma: { positionHistory: { create: ReturnType<typeof vi.fn> } };
  let redis: {
    set: ReturnType<typeof vi.fn>;
    getClient: ReturnType<typeof vi.fn>;
    rawSet: ReturnType<typeof vi.fn>;
  };
  let publish: ReturnType<typeof vi.fn>;
  let missionQueue: { add: ReturnType<typeof vi.fn> };
  let antiCheatQueue: { add: ReturnType<typeof vi.fn> };

  beforeAll(() => {
    Object.assign(process.env, TEST_ENV);
  });

  beforeEach(() => {
    prisma = { positionHistory: { create: vi.fn().mockResolvedValue({}) } };
    publish = vi.fn().mockResolvedValue(1);
    redis = {
      set: vi.fn().mockResolvedValue(undefined),
      rawSet: vi.fn().mockResolvedValue('OK'),
      getClient: vi.fn(),
    };
    redis.getClient.mockReturnValue({ set: redis.rawSet, publish });
    missionQueue = { add: vi.fn().mockResolvedValue({ id: 'mq-job' }) };
    antiCheatQueue = { add: vi.fn().mockResolvedValue({ id: 'ac-job' }) };

    processor = new PositionsProcessor(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
      missionQueue as never,
      antiCheatQueue as never,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('appends to position_history and updates Redis live snapshot', async () => {
    await processor.process(makeJob() as never);

    expect(redis.rawSet).toHaveBeenCalledWith(
      `dedup:position:${CLIENT_EVENT_ID}`,
      '1',
      'EX',
      300,
      'NX',
    );
    expect(prisma.positionHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operatorId: OPERATOR_ID,
        eventId: EVENT_ID,
        lat: -23.55,
        lon: -46.62,
        clientEventId: CLIENT_EVENT_ID,
      }),
    });

    expect(redis.set).toHaveBeenCalledOnce();
    const [key, value, ttl] = redis.set.mock.calls[0] as [string, string, number];
    expect(key).toBe(`live:position:${OPERATOR_ID}`);
    expect(ttl).toBe(60);
    const snapshot = JSON.parse(value) as { lat: number; lon: number; operatorId: string };
    expect(snapshot.operatorId).toBe(OPERATOR_ID);
    expect(snapshot.lat).toBe(-23.55);
    expect(snapshot.lon).toBe(-46.62);

    // Realtime fan-out: must publish on event:<id>:positions with the same JSON.
    expect(publish).toHaveBeenCalledOnce();
    const [channel, published] = publish.mock.calls[0] as [string, string];
    expect(channel).toBe(`event:${EVENT_ID}:positions`);
    expect(published).toBe(value);

    // Mission engine: tick enqueued with deterministic jobId.
    expect(missionQueue.add).toHaveBeenCalledOnce();
    const [jobName, jobData, opts] = missionQueue.add.mock.calls[0] as [
      string,
      Record<string, unknown>,
      { jobId: string; attempts: number },
    ];
    expect(jobName).toBe('tick');
    expect(jobData.eventId).toBe(EVENT_ID);
    expect(jobData.operatorId).toBe(OPERATOR_ID);
    expect(opts.jobId).toMatch(`${EVENT_ID}:${OPERATOR_ID}:`);
    expect(opts.attempts).toBe(3);
  });

  it('skips silently when SETNX returns null (duplicate clientEventId)', async () => {
    redis.rawSet.mockResolvedValue(null);

    await processor.process(makeJob() as never);

    expect(prisma.positionHistory.create).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
    expect(missionQueue.add).not.toHaveBeenCalled();
    expect(antiCheatQueue.add).not.toHaveBeenCalled();
  });

  it('does not throw when realtime publish fails (best-effort)', async () => {
    publish.mockRejectedValueOnce(new Error('redis publish broke'));
    await expect(processor.process(makeJob() as never)).resolves.toBeUndefined();
    // Live snapshot was still written even though fan-out failed.
    expect(redis.set).toHaveBeenCalled();
    // Mission engine still enqueued.
    expect(missionQueue.add).toHaveBeenCalled();
  });

  it('does not throw when mission-engine enqueue fails (best-effort)', async () => {
    missionQueue.add.mockRejectedValueOnce(new Error('queue down'));
    await expect(processor.process(makeJob() as never)).resolves.toBeUndefined();
    expect(prisma.positionHistory.create).toHaveBeenCalled();
    // Anti-cheat still runs even when mission-engine enqueue fails.
    expect(antiCheatQueue.add).toHaveBeenCalled();
  });

  it('enqueues anti-cheat tick with payload + suffixed jobId', async () => {
    await processor.process(makeJob({ speedMps: 12.3, accuracyM: 8.5 }) as never);

    expect(antiCheatQueue.add).toHaveBeenCalledOnce();
    const [jobName, jobData, opts] = antiCheatQueue.add.mock.calls[0] as [
      string,
      Record<string, unknown>,
      { jobId: string; attempts: number },
    ];
    expect(jobName).toBe('inspect');
    expect(jobData).toMatchObject({
      eventId: EVENT_ID,
      operatorId: OPERATOR_ID,
      lat: -23.55,
      lon: -46.62,
      clientSpeedMps: 12.3,
      accuracyM: 8.5,
    });
    expect(opts.jobId).toMatch(new RegExp(`^${EVENT_ID}:${OPERATOR_ID}:\\d+$`));
    expect(opts.attempts).toBe(3);
  });

  it('does not throw when anti-cheat enqueue fails (best-effort)', async () => {
    antiCheatQueue.add.mockRejectedValueOnce(new Error('anti-cheat queue down'));
    await expect(processor.process(makeJob() as never)).resolves.toBeUndefined();
    expect(prisma.positionHistory.create).toHaveBeenCalled();
    expect(missionQueue.add).toHaveBeenCalled();
  });

  it('clamps recordedAt to receivedAt when client clock drifts > 5min', async () => {
    const job = makeJob({
      recordedAt: '2026-05-03T20:00:00.000Z', // 2h before receivedAt
      receivedAt: '2026-05-03T22:00:01.000Z',
    });

    await processor.process(job as never);

    const arg = prisma.positionHistory.create.mock.calls[0][0] as {
      data: { recordedAt: Date };
    };
    // Clamped to receivedAt.
    expect(arg.data.recordedAt.toISOString()).toBe('2026-05-03T22:00:01.000Z');
  });

  it('keeps client recordedAt when drift is within 5min', async () => {
    const job = makeJob({
      recordedAt: '2026-05-03T22:00:00.000Z',
      receivedAt: '2026-05-03T22:00:30.000Z',
    });

    await processor.process(job as never);

    const arg = prisma.positionHistory.create.mock.calls[0][0] as {
      data: { recordedAt: Date };
    };
    expect(arg.data.recordedAt.toISOString()).toBe('2026-05-03T22:00:00.000Z');
  });
});
