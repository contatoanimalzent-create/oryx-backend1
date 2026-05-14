import { MissionProgressState, MissionType } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../shared/database/prisma.service';
import type { RedisService } from '../../shared/redis/redis.service';
import type { MissionProgressJob } from './dto/mission-engine.dto';
import { MissionEngineService } from './mission-engine.service';

const EVENT_ID = '11111111-1111-1111-1111-111111111111';
const OPERATOR_ID = '22222222-2222-2222-2222-222222222222';
const ZONE_ID = '33333333-3333-3333-3333-333333333333';
const MISSION_ID = '44444444-4444-4444-4444-444444444444';

const baseJob: MissionProgressJob = {
  eventId: EVENT_ID,
  operatorId: OPERATOR_ID,
  lat: -23.55,
  lon: -46.62,
  recordedAt: '2026-05-04T15:00:00.000Z',
};

interface MissionRow {
  id: string;
  eventId: string;
  type: MissionType;
  zoneId: string | null;
  config: unknown;
  status: 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
}

function makeMission(overrides: Partial<MissionRow> = {}): MissionRow {
  return {
    id: MISSION_ID,
    eventId: EVENT_ID,
    type: MissionType.CHECKPOINT,
    zoneId: ZONE_ID,
    config: {},
    status: 'PENDING',
    ...overrides,
  };
}

describe('MissionEngineService', () => {
  let service: MissionEngineService;
  let prisma: {
    mission: { findMany: ReturnType<typeof vi.fn> };
    missionProgress: {
      findUnique: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
    };
    $queryRaw: ReturnType<typeof vi.fn>;
  };
  let redis: { getClient: ReturnType<typeof vi.fn> };
  let publish: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    publish = vi.fn().mockResolvedValue(1);
    prisma = {
      mission: { findMany: vi.fn() },
      missionProgress: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockImplementation(({ create }: { create: unknown }) =>
          Promise.resolve({
            ...(create as object),
            id: 'progress-id',
            createdAt: new Date(),
            updatedAt: new Date(),
            completedAt: (create as { completedAt?: Date }).completedAt ?? null,
          }),
        ),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ id: ZONE_ID, inside: true }]),
    };
    redis = { getClient: vi.fn().mockReturnValue({ publish }) };

    service = new MissionEngineService(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── early exits ───────────────────────────────────────────────────────

  it('does nothing when no missions match', async () => {
    prisma.mission.findMany.mockResolvedValue([]);
    await service.processPosition(baseJob);
    expect(prisma.missionProgress.upsert).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('skips SQUAD/FACTION missions silently', async () => {
    prisma.mission.findMany.mockResolvedValue([
      makeMission({ type: MissionType.SQUAD, zoneId: null }),
      makeMission({ type: MissionType.FACTION, zoneId: null, id: 'm2' }),
    ]);
    await service.processPosition(baseJob);
    expect(prisma.missionProgress.upsert).not.toHaveBeenCalled();
  });

  // ─── CHECKPOINT ────────────────────────────────────────────────────────

  describe('CHECKPOINT', () => {
    it('completes when inside zone', async () => {
      prisma.mission.findMany.mockResolvedValue([makeMission({ type: MissionType.CHECKPOINT })]);
      prisma.$queryRaw.mockResolvedValue([{ id: ZONE_ID, inside: true }]);

      await service.processPosition(baseJob);

      expect(prisma.missionProgress.upsert).toHaveBeenCalledOnce();
      const call = prisma.missionProgress.upsert.mock.calls[0][0] as {
        create: { state: MissionProgressState; completedAt: Date };
      };
      expect(call.create.state).toBe(MissionProgressState.COMPLETED);
      expect(call.create.completedAt).toBeInstanceOf(Date);
    });

    it('does nothing when outside zone', async () => {
      prisma.mission.findMany.mockResolvedValue([makeMission({ type: MissionType.CHECKPOINT })]);
      prisma.$queryRaw.mockResolvedValue([{ id: ZONE_ID, inside: false }]);

      await service.processPosition(baseJob);

      expect(prisma.missionProgress.upsert).not.toHaveBeenCalled();
    });
  });

  // ─── CAPTURE / HOLD / DEFEND (cumulative) ──────────────────────────────

  describe('cumulative-time types', () => {
    it('CAPTURE accumulates seconds across positions and completes at threshold', async () => {
      prisma.mission.findMany.mockResolvedValue([
        makeMission({ type: MissionType.CAPTURE, config: { thresholdSeconds: 60 } }),
      ]);
      prisma.$queryRaw.mockResolvedValue([{ id: ZONE_ID, inside: true }]);

      // First tick: no prior progress, just establishes lastInsideAt.
      await service.processPosition({ ...baseJob, recordedAt: '2026-05-04T15:00:00.000Z' });
      const first = prisma.missionProgress.upsert.mock.calls[0][0] as {
        create: { state: MissionProgressState; progress: { secondsAccumulated: number } };
      };
      expect(first.create.progress.secondsAccumulated).toBe(0);
      expect(first.create.state).toBe(MissionProgressState.IN_PROGRESS);

      // Second tick 30s later: 30s accumulated.
      prisma.missionProgress.findUnique.mockResolvedValue({
        progress: { secondsAccumulated: 0, lastInsideAt: '2026-05-04T15:00:00.000Z' },
        state: MissionProgressState.IN_PROGRESS,
        completedAt: null,
      });
      await service.processPosition({ ...baseJob, recordedAt: '2026-05-04T15:00:30.000Z' });
      const second = prisma.missionProgress.upsert.mock.calls[1][0] as {
        create: { state: MissionProgressState; progress: { secondsAccumulated: number } };
      };
      expect(second.create.progress.secondsAccumulated).toBe(30);
      expect(second.create.state).toBe(MissionProgressState.IN_PROGRESS);

      // Third tick at 60s: completes.
      prisma.missionProgress.findUnique.mockResolvedValue({
        progress: { secondsAccumulated: 30, lastInsideAt: '2026-05-04T15:00:30.000Z' },
        state: MissionProgressState.IN_PROGRESS,
        completedAt: null,
      });
      await service.processPosition({ ...baseJob, recordedAt: '2026-05-04T15:01:30.000Z' });
      const third = prisma.missionProgress.upsert.mock.calls[2][0] as {
        create: { state: MissionProgressState; completedAt: Date | null };
      };
      expect(third.create.state).toBe(MissionProgressState.COMPLETED);
      expect(third.create.completedAt).not.toBeNull();
    });

    it('does not regress to IN_PROGRESS once COMPLETED (operator leaves zone)', async () => {
      prisma.mission.findMany.mockResolvedValue([
        makeMission({ type: MissionType.HOLD, config: { durationSeconds: 30 } }),
      ]);
      prisma.$queryRaw.mockResolvedValue([{ id: ZONE_ID, inside: false }]); // outside now
      prisma.missionProgress.findUnique.mockResolvedValue({
        progress: { secondsAccumulated: 100, lastInsideAt: '2026-05-04T15:00:00.000Z' },
        state: MissionProgressState.COMPLETED,
        completedAt: new Date('2026-05-04T15:00:00.000Z'),
      });

      await service.processPosition(baseJob);

      const call = prisma.missionProgress.upsert.mock.calls[0][0] as {
        create: { state: MissionProgressState };
      };
      expect(call.create.state).toBe(MissionProgressState.COMPLETED);
    });
  });

  // ─── TIME ──────────────────────────────────────────────────────────────

  describe('TIME', () => {
    it('completes when inside window (and inside zone if set)', async () => {
      prisma.mission.findMany.mockResolvedValue([
        makeMission({
          type: MissionType.TIME,
          zoneId: null,
          config: {
            windowStart: '2026-05-04T14:00:00.000Z',
            windowEnd: '2026-05-04T16:00:00.000Z',
          },
        }),
      ]);

      await service.processPosition({ ...baseJob, recordedAt: '2026-05-04T15:30:00.000Z' });

      const call = prisma.missionProgress.upsert.mock.calls[0][0] as {
        create: { state: MissionProgressState };
      };
      expect(call.create.state).toBe(MissionProgressState.COMPLETED);
    });

    it('does nothing outside the window', async () => {
      prisma.mission.findMany.mockResolvedValue([
        makeMission({
          type: MissionType.TIME,
          zoneId: null,
          config: {
            windowStart: '2026-05-04T14:00:00.000Z',
            windowEnd: '2026-05-04T15:00:00.000Z',
          },
        }),
      ]);

      await service.processPosition({ ...baseJob, recordedAt: '2026-05-04T16:00:00.000Z' });

      expect(prisma.missionProgress.upsert).not.toHaveBeenCalled();
    });

    it('with zone, requires inside zone too', async () => {
      prisma.mission.findMany.mockResolvedValue([
        makeMission({
          type: MissionType.TIME,
          config: {
            windowStart: '2026-05-04T14:00:00.000Z',
            windowEnd: '2026-05-04T16:00:00.000Z',
          },
        }),
      ]);
      prisma.$queryRaw.mockResolvedValue([{ id: ZONE_ID, inside: false }]);

      await service.processPosition({ ...baseJob, recordedAt: '2026-05-04T15:00:00.000Z' });

      expect(prisma.missionProgress.upsert).not.toHaveBeenCalled();
    });
  });

  // ─── pub/sub ──────────────────────────────────────────────────────────

  it('publishes mission:progress:updated when row is upserted', async () => {
    prisma.mission.findMany.mockResolvedValue([makeMission({ type: MissionType.CHECKPOINT })]);
    prisma.$queryRaw.mockResolvedValue([{ id: ZONE_ID, inside: true }]);

    await service.processPosition(baseJob);

    expect(publish).toHaveBeenCalledOnce();
    const [channel, message] = publish.mock.calls[0] as [string, string];
    expect(channel).toBe('mission:progress:updated');
    const parsed = JSON.parse(message) as {
      missionId: string;
      operatorId: string;
      state: MissionProgressState;
    };
    expect(parsed.missionId).toBe(MISSION_ID);
    expect(parsed.operatorId).toBe(OPERATOR_ID);
    expect(parsed.state).toBe(MissionProgressState.COMPLETED);
  });
});
