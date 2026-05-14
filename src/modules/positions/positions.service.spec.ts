import { getQueueToken } from '@nestjs/bullmq';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventStatus, SquadStatus } from '@prisma/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../../shared/database/prisma.service';
import { POSITIONS_QUEUE_NAME, type IngestPositionDto } from './dto/positions.dto';
import { PositionsService } from './positions.service';

const TEST_ENV = {
  NODE_ENV: 'test',
  PORT: '3000',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://x:x@localhost:5432/x',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

const USER_ID = '11111111-1111-1111-1111-111111111111';
const OPERATOR_ID = '22222222-2222-2222-2222-222222222222';
const EVENT_ID = '33333333-3333-3333-3333-333333333333';
const OTHER_EVENT_ID = '44444444-4444-4444-4444-444444444444';
const CLIENT_EVENT_ID = '55555555-5555-5555-5555-555555555555';

const validDto: IngestPositionDto = {
  eventId: EVENT_ID,
  lat: -23.55,
  lon: -46.62,
  recordedAt: '2026-05-03T22:00:00.000Z',
  clientEventId: CLIENT_EVENT_ID,
};

describe('PositionsService', () => {
  let service: PositionsService;
  let prisma: {
    operator: { findUnique: ReturnType<typeof vi.fn> };
    squadMember: { findFirst: ReturnType<typeof vi.fn> };
  };
  let queue: { add: ReturnType<typeof vi.fn> };

  beforeAll(() => {
    Object.assign(process.env, TEST_ENV);
  });

  beforeEach(async () => {
    prisma = {
      operator: { findUnique: vi.fn() },
      squadMember: { findFirst: vi.fn() },
    };
    queue = { add: vi.fn().mockResolvedValue({ id: 'job' }) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PositionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: getQueueToken(POSITIONS_QUEUE_NAME), useValue: queue },
      ],
    }).compile();
    service = moduleRef.get(PositionsService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function activeMembership(eventId = EVENT_ID): unknown {
    return {
      squad: {
        status: SquadStatus.ACTIVE,
        team: { event: { id: eventId, status: EventStatus.ACTIVE } },
      },
    };
  }

  it('enqueues a job using clientEventId as jobId for dedup', async () => {
    prisma.operator.findUnique.mockResolvedValue({ id: OPERATOR_ID, userId: USER_ID });
    prisma.squadMember.findFirst.mockResolvedValue(activeMembership());

    const result = await service.ingest(USER_ID, validDto);

    expect(result.clientEventId).toBe(CLIENT_EVENT_ID);
    expect(queue.add).toHaveBeenCalledOnce();
    const [name, jobData, opts] = queue.add.mock.calls[0] as [
      string,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(name).toBe('ingest');
    expect(jobData.operatorId).toBe(OPERATOR_ID);
    expect(jobData.clientEventId).toBe(CLIENT_EVENT_ID);
    expect(opts.jobId).toBe(CLIENT_EVENT_ID);
    expect(opts.attempts).toBe(3);
  });

  it('rejects when user has no operator profile (404)', async () => {
    prisma.operator.findUnique.mockResolvedValue(null);
    await expect(service.ingest(USER_ID, validDto)).rejects.toThrow(NotFoundException);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('rejects when operator has no squad membership (409)', async () => {
    prisma.operator.findUnique.mockResolvedValue({ id: OPERATOR_ID, userId: USER_ID });
    prisma.squadMember.findFirst.mockResolvedValue(null);
    await expect(service.ingest(USER_ID, validDto)).rejects.toThrow(ConflictException);
  });

  it('rejects when squad is INACTIVE/DISBANDED', async () => {
    for (const status of [SquadStatus.INACTIVE, SquadStatus.DISBANDED]) {
      prisma.operator.findUnique.mockResolvedValue({ id: OPERATOR_ID, userId: USER_ID });
      prisma.squadMember.findFirst.mockResolvedValue({
        squad: {
          status,
          team: { event: { id: EVENT_ID, status: EventStatus.ACTIVE } },
        },
      });
      await expect(service.ingest(USER_ID, validDto)).rejects.toThrow(ConflictException);
    }
  });

  it('rejects when event is not ACTIVE', async () => {
    for (const status of [EventStatus.DRAFT, EventStatus.ENDED]) {
      prisma.operator.findUnique.mockResolvedValue({ id: OPERATOR_ID, userId: USER_ID });
      prisma.squadMember.findFirst.mockResolvedValue({
        squad: {
          status: SquadStatus.ACTIVE,
          team: { event: { id: EVENT_ID, status } },
        },
      });
      await expect(service.ingest(USER_ID, validDto)).rejects.toThrow(ConflictException);
    }
  });

  it('rejects cross-event spoofing (body eventId != operator active event)', async () => {
    prisma.operator.findUnique.mockResolvedValue({ id: OPERATOR_ID, userId: USER_ID });
    prisma.squadMember.findFirst.mockResolvedValue(activeMembership(OTHER_EVENT_ID));

    await expect(service.ingest(USER_ID, validDto)).rejects.toThrow(/eventId/i);
    expect(queue.add).not.toHaveBeenCalled();
  });
});
