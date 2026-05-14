import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MissionStatus, MissionType } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MissionsController } from './missions.controller';
import { MissionsService } from './missions.service';

const EVENT_ID = '11111111-1111-1111-1111-111111111111';
const ZONE_ID = '22222222-2222-2222-2222-222222222222';
const MISSION_ID = '33333333-3333-3333-3333-333333333333';

const VIEW = {
  id: MISSION_ID,
  eventId: EVENT_ID,
  type: MissionType.CHECKPOINT,
  name: 'CP-Alpha',
  description: null,
  zoneId: ZONE_ID,
  config: {},
  pointsReward: 100,
  status: MissionStatus.PENDING,
  createdAt: '2026-05-04T14:00:00.000Z',
  updatedAt: '2026-05-04T14:00:00.000Z',
};

describe('MissionsController', () => {
  let controller: MissionsController;
  let service: {
    createForEvent: ReturnType<typeof vi.fn>;
    listByEvent: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    service = {
      createForEvent: vi.fn(),
      listByEvent: vi.fn(),
      getById: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [MissionsController],
      providers: [{ provide: MissionsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(MissionsController);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /events/:eventId/missions', () => {
    it('rejects body without type discriminator', async () => {
      await expect(controller.create({ eventId: EVENT_ID }, { name: 'X' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects CAPTURE without zoneId', async () => {
      await expect(
        controller.create(
          { eventId: EVENT_ID },
          {
            type: 'CAPTURE',
            name: 'Cap',
            config: { thresholdSeconds: 30 },
            pointsReward: 100,
          },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects CHECKPOINT with extra config keys', async () => {
      await expect(
        controller.create(
          { eventId: EVENT_ID },
          {
            type: 'CHECKPOINT',
            name: 'CP',
            zoneId: ZONE_ID,
            config: { extra: 'no' },
            pointsReward: 50,
          },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects TIME with windowEnd <= windowStart', async () => {
      await expect(
        controller.create(
          { eventId: EVENT_ID },
          {
            type: 'TIME',
            name: 'TW',
            config: {
              windowStart: '2026-05-04T16:00:00.000Z',
              windowEnd: '2026-05-04T14:00:00.000Z',
            },
            pointsReward: 25,
          },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('forwards a valid CHECKPOINT body', async () => {
      service.createForEvent.mockResolvedValue(VIEW);
      await controller.create(
        { eventId: EVENT_ID },
        {
          type: 'CHECKPOINT',
          name: 'CP-Alpha',
          zoneId: ZONE_ID,
          config: {},
          pointsReward: 100,
        },
      );
      expect(service.createForEvent).toHaveBeenCalledWith(
        EVENT_ID,
        expect.objectContaining({ type: MissionType.CHECKPOINT, pointsReward: 100 }),
      );
    });

    it('forwards a valid TIME body without zoneId', async () => {
      service.createForEvent.mockResolvedValue({ ...VIEW, type: MissionType.TIME, zoneId: null });
      await controller.create(
        { eventId: EVENT_ID },
        {
          type: 'TIME',
          name: 'TW',
          config: {
            windowStart: '2026-05-04T14:00:00.000Z',
            windowEnd: '2026-05-04T16:00:00.000Z',
          },
          pointsReward: 25,
        },
      );
      expect(service.createForEvent).toHaveBeenCalledOnce();
    });
  });

  describe('GET /events/:eventId/missions', () => {
    it('forwards filter query', async () => {
      service.listByEvent.mockResolvedValue([VIEW]);
      await controller.listByEvent({ eventId: EVENT_ID }, { type: 'CHECKPOINT' });
      expect(service.listByEvent).toHaveBeenCalledWith(EVENT_ID, {
        type: MissionType.CHECKPOINT,
      });
    });

    it('handles empty query', async () => {
      service.listByEvent.mockResolvedValue([]);
      await controller.listByEvent({ eventId: EVENT_ID }, undefined);
      expect(service.listByEvent).toHaveBeenCalledWith(EVENT_ID, {});
    });
  });

  describe('PATCH /missions/:id', () => {
    it('rejects empty body', async () => {
      await expect(controller.update({ id: MISSION_ID }, {})).rejects.toThrow(BadRequestException);
    });

    it('strips type/zoneId/config — Zod ignores them, only metadata reaches service', async () => {
      service.update.mockResolvedValue(VIEW);
      await controller.update(
        { id: MISSION_ID },
        {
          name: 'NewName',
          type: 'TIME', // ignored
          zoneId: 'nope', // ignored
          config: { foo: 'bar' }, // ignored
        },
      );
      const dto = service.update.mock.calls[0][1] as Record<string, unknown>;
      expect(dto.name).toBe('NewName');
      expect(dto.type).toBeUndefined();
      expect(dto.zoneId).toBeUndefined();
      expect(dto.config).toBeUndefined();
    });

    it('accepts status update', async () => {
      service.update.mockResolvedValue(VIEW);
      await controller.update({ id: MISSION_ID }, { status: 'CANCELLED' });
      expect(service.update).toHaveBeenCalledWith(MISSION_ID, {
        status: MissionStatus.CANCELLED,
      });
    });
  });

  describe('DELETE /missions/:id', () => {
    it('forwards parsed id', async () => {
      service.remove.mockResolvedValue(undefined);
      await controller.remove({ id: MISSION_ID });
      expect(service.remove).toHaveBeenCalledWith(MISSION_ID);
    });
  });
});
