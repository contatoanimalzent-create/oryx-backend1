import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';

const EVENT_ID = '11111111-1111-1111-1111-111111111111';
const TEAM_ID = '22222222-2222-2222-2222-222222222222';

const VIEW = {
  id: TEAM_ID,
  eventId: EVENT_ID,
  name: 'Wolves',
  color: '#3366ff',
  emblem: null,
  description: null,
  createdAt: '2026-05-03T21:00:00.000Z',
  updatedAt: '2026-05-03T21:00:00.000Z',
};

describe('TeamsController', () => {
  let controller: TeamsController;
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
      controllers: [TeamsController],
      providers: [{ provide: TeamsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(TeamsController);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /events/:eventId/teams', () => {
    it('rejects invalid hex color (#FFF)', async () => {
      await expect(
        controller.create({ eventId: EVENT_ID }, { name: 'Wolves', color: '#FFF' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects non-hex color', async () => {
      await expect(
        controller.create({ eventId: EVENT_ID }, { name: 'Wolves', color: 'red' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects non-UUID eventId', async () => {
      await expect(
        controller.create({ eventId: 'no' }, { name: 'Wolves', color: '#3366ff' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lowercases color before forwarding', async () => {
      service.createForEvent.mockResolvedValue(VIEW);
      await controller.create({ eventId: EVENT_ID }, { name: 'Wolves', color: '#3366FF' });
      expect(service.createForEvent).toHaveBeenCalledWith(EVENT_ID, {
        name: 'Wolves',
        color: '#3366ff',
      });
    });
  });

  describe('GET /events/:eventId/teams', () => {
    it('rejects non-UUID', async () => {
      await expect(controller.listByEvent({ eventId: 'no' })).rejects.toThrow(BadRequestException);
    });

    it('forwards to service', async () => {
      service.listByEvent.mockResolvedValue([VIEW]);
      await controller.listByEvent({ eventId: EVENT_ID });
      expect(service.listByEvent).toHaveBeenCalledWith(EVENT_ID);
    });
  });

  describe('GET /teams/:id', () => {
    it('rejects non-UUID', async () => {
      await expect(controller.getById({ id: 'no' })).rejects.toThrow(BadRequestException);
    });

    it('forwards parsed UUID', async () => {
      service.getById.mockResolvedValue(VIEW);
      await controller.getById({ id: TEAM_ID });
      expect(service.getById).toHaveBeenCalledWith(TEAM_ID);
    });
  });

  describe('PATCH /teams/:id', () => {
    it('rejects empty body', async () => {
      await expect(controller.update({ id: TEAM_ID }, {})).rejects.toThrow(BadRequestException);
    });

    it('rejects color not matching #RRGGBB', async () => {
      await expect(controller.update({ id: TEAM_ID }, { color: 'orange' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('forwards partial update with normalized color', async () => {
      service.update.mockResolvedValue(VIEW);
      await controller.update({ id: TEAM_ID }, { color: '#FF00AA' });
      expect(service.update).toHaveBeenCalledWith(TEAM_ID, { color: '#ff00aa' });
    });
  });

  describe('DELETE /teams/:id', () => {
    it('forwards parsed UUID', async () => {
      service.remove.mockResolvedValue(undefined);
      await controller.remove({ id: TEAM_ID });
      expect(service.remove).toHaveBeenCalledWith(TEAM_ID);
    });
  });
});
