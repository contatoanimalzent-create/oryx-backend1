import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventStatus, MissionStatus, MissionType } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../../shared/database/prisma.service';
import type { CreateMissionDto } from './dto/missions.dto';
import { MissionsRepository } from './missions.repository';
import { MissionsService } from './missions.service';

const EVENT_ID = '11111111-1111-1111-1111-111111111111';
const ZONE_ID = '22222222-2222-2222-2222-222222222222';
const OTHER_ZONE_ID = '33333333-3333-3333-3333-333333333333';
const MISSION_ID = '44444444-4444-4444-4444-444444444444';

const draftEvent = { id: EVENT_ID, status: EventStatus.DRAFT };
const activeEvent = { id: EVENT_ID, status: EventStatus.ACTIVE };
const endedEvent = { id: EVENT_ID, status: EventStatus.ENDED };

const baseMission = {
  id: MISSION_ID,
  eventId: EVENT_ID,
  type: MissionType.CHECKPOINT,
  name: 'CP-Alpha',
  description: null,
  zoneId: ZONE_ID,
  config: {},
  pointsReward: 100,
  status: MissionStatus.PENDING,
  createdAt: new Date('2026-05-04T14:00:00Z'),
  updatedAt: new Date('2026-05-04T14:00:00Z'),
};

const checkpointDto: CreateMissionDto = {
  type: MissionType.CHECKPOINT,
  name: 'CP-Alpha',
  zoneId: ZONE_ID,
  config: {},
  pointsReward: 100,
};

describe('MissionsService', () => {
  let service: MissionsService;
  let repo: {
    findById: ReturnType<typeof vi.fn>;
    findByEventAndName: ReturnType<typeof vi.fn>;
    listByEvent: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    updateById: ReturnType<typeof vi.fn>;
    deleteById: ReturnType<typeof vi.fn>;
  };
  let prisma: {
    event: { findUnique: ReturnType<typeof vi.fn> };
    zone: { findUnique: ReturnType<typeof vi.fn> };
  };

  beforeEach(async () => {
    repo = {
      findById: vi.fn(),
      findByEventAndName: vi.fn(),
      listByEvent: vi.fn(),
      create: vi.fn(),
      updateById: vi.fn(),
      deleteById: vi.fn(),
    };
    prisma = {
      event: { findUnique: vi.fn() },
      zone: { findUnique: vi.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MissionsService,
        { provide: MissionsRepository, useValue: repo },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(MissionsService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createForEvent', () => {
    it('creates a CHECKPOINT mission with valid zone', async () => {
      prisma.event.findUnique.mockResolvedValue(draftEvent);
      repo.findByEventAndName.mockResolvedValue(null);
      prisma.zone.findUnique.mockResolvedValue({ id: ZONE_ID, eventId: EVENT_ID });
      repo.create.mockResolvedValue(baseMission);

      const result = await service.createForEvent(EVENT_ID, checkpointDto);

      expect(result.type).toBe(MissionType.CHECKPOINT);
      expect(result.zoneId).toBe(ZONE_ID);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ eventId: EVENT_ID, type: MissionType.CHECKPOINT }),
      );
    });

    it('refuses on ENDED event', async () => {
      prisma.event.findUnique.mockResolvedValue(endedEvent);
      await expect(service.createForEvent(EVENT_ID, checkpointDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects 404 when event missing', async () => {
      prisma.event.findUnique.mockResolvedValue(null);
      await expect(service.createForEvent(EVENT_ID, checkpointDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects duplicate name within event', async () => {
      prisma.event.findUnique.mockResolvedValue(draftEvent);
      repo.findByEventAndName.mockResolvedValue(baseMission);
      await expect(service.createForEvent(EVENT_ID, checkpointDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects when zone belongs to a different event', async () => {
      prisma.event.findUnique.mockResolvedValue(draftEvent);
      repo.findByEventAndName.mockResolvedValue(null);
      prisma.zone.findUnique.mockResolvedValue({
        id: ZONE_ID,
        eventId: 'other-event',
      });
      await expect(service.createForEvent(EVENT_ID, checkpointDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects 404 when zone missing for spatial type', async () => {
      prisma.event.findUnique.mockResolvedValue(draftEvent);
      repo.findByEventAndName.mockResolvedValue(null);
      prisma.zone.findUnique.mockResolvedValue(null);
      await expect(service.createForEvent(EVENT_ID, checkpointDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('creates a TIME mission without zone', async () => {
      prisma.event.findUnique.mockResolvedValue(draftEvent);
      repo.findByEventAndName.mockResolvedValue(null);
      const timeMission = {
        ...baseMission,
        type: MissionType.TIME,
        zoneId: null,
        config: {
          windowStart: '2026-05-04T14:00:00.000Z',
          windowEnd: '2026-05-04T16:00:00.000Z',
        },
      };
      repo.create.mockResolvedValue(timeMission);

      const dto: CreateMissionDto = {
        type: MissionType.TIME,
        name: 'TimeWindow',
        config: {
          windowStart: '2026-05-04T14:00:00.000Z',
          windowEnd: '2026-05-04T16:00:00.000Z',
        },
        pointsReward: 50,
      };
      const result = await service.createForEvent(EVENT_ID, dto);
      expect(result.type).toBe(MissionType.TIME);
      expect(result.zoneId).toBeNull();
      expect(prisma.zone.findUnique).not.toHaveBeenCalled();
    });

    it('creates a SQUAD mission without zone', async () => {
      prisma.event.findUnique.mockResolvedValue(draftEvent);
      repo.findByEventAndName.mockResolvedValue(null);
      repo.create.mockResolvedValue({
        ...baseMission,
        type: MissionType.SQUAD,
        zoneId: null,
        config: { targetSquadId: OTHER_ZONE_ID },
      });

      const dto: CreateMissionDto = {
        type: MissionType.SQUAD,
        name: 'SquadGoal',
        config: { targetSquadId: OTHER_ZONE_ID },
        pointsReward: 0,
      };
      const result = await service.createForEvent(EVENT_ID, dto);
      expect(result.type).toBe(MissionType.SQUAD);
      expect(result.zoneId).toBeNull();
    });
  });

  describe('update', () => {
    it('refuses on ENDED', async () => {
      repo.findById.mockResolvedValue(baseMission);
      prisma.event.findUnique.mockResolvedValue(endedEvent);
      await expect(service.update(MISSION_ID, { name: 'X' })).rejects.toThrow(ConflictException);
    });

    it('updates status (admin can cancel)', async () => {
      repo.findById.mockResolvedValue(baseMission);
      prisma.event.findUnique.mockResolvedValue(activeEvent);
      repo.updateById.mockResolvedValue({ ...baseMission, status: MissionStatus.CANCELLED });

      const result = await service.update(MISSION_ID, { status: MissionStatus.CANCELLED });
      expect(result.status).toBe(MissionStatus.CANCELLED);
    });

    it('rejects duplicate name change', async () => {
      repo.findById.mockResolvedValue(baseMission);
      prisma.event.findUnique.mockResolvedValue(draftEvent);
      repo.findByEventAndName.mockResolvedValue({ ...baseMission, id: 'other' });
      await expect(service.update(MISSION_ID, { name: 'Other' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('remove', () => {
    it('deletes in DRAFT', async () => {
      repo.findById.mockResolvedValue(baseMission);
      prisma.event.findUnique.mockResolvedValue(draftEvent);
      repo.deleteById.mockResolvedValue(baseMission);
      await service.remove(MISSION_ID);
      expect(repo.deleteById).toHaveBeenCalledWith(MISSION_ID);
    });

    it('refuses in ACTIVE/ENDED', async () => {
      for (const event of [activeEvent, endedEvent]) {
        repo.findById.mockResolvedValueOnce(baseMission);
        prisma.event.findUnique.mockResolvedValueOnce(event);
        await expect(service.remove(MISSION_ID)).rejects.toThrow(ConflictException);
      }
    });
  });
});
