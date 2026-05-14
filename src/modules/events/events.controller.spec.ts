import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventMode, EventStatus, Role } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { GeoPolygon } from './dto/events.dto';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

const ADMIN = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'admin@oryx.app',
  displayName: 'Admin',
  role: Role.ADMIN,
};

const POLYGON: GeoPolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [-46.65, -23.55],
      [-46.62, -23.55],
      [-46.62, -23.52],
      [-46.65, -23.52],
      [-46.65, -23.55],
    ],
  ],
};

const VIEW = {
  id: '22222222-2222-2222-2222-222222222222',
  name: 'OP Sentinel',
  description: null,
  mode: EventMode.WARFARE,
  status: EventStatus.DRAFT,
  operationalArea: POLYGON,
  startsAt: null,
  endsAt: null,
  createdById: ADMIN.id,
  createdAt: '2026-05-03T20:00:00.000Z',
  updatedAt: '2026-05-03T20:00:00.000Z',
};

describe('EventsController', () => {
  let controller: EventsController;
  let service: {
    create: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    activate: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    service = {
      create: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
      update: vi.fn(),
      activate: vi.fn(),
      end: vi.fn(),
      remove: vi.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [{ provide: EventsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(EventsController);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /events', () => {
    it('rejects body without operationalArea', async () => {
      await expect(
        controller.create(ADMIN, { name: 'X', mode: EventMode.WARFARE }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects malformed Polygon (open ring)', async () => {
      const openRing: GeoPolygon = {
        type: 'Polygon',
        coordinates: [
          [
            [-46.65, -23.55],
            [-46.62, -23.55],
            [-46.62, -23.52],
            [-46.65, -23.52],
            // missing closing position
          ],
        ],
      };
      await expect(
        controller.create(ADMIN, {
          name: 'X',
          mode: EventMode.WARFARE,
          operationalArea: openRing,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects out-of-range longitude', async () => {
      const bad: GeoPolygon = {
        type: 'Polygon',
        coordinates: [
          [
            [200, -23.55],
            [-46.62, -23.55],
            [-46.62, -23.52],
            [-46.65, -23.52],
            [200, -23.55],
          ],
        ],
      };
      await expect(
        controller.create(ADMIN, {
          name: 'X',
          mode: EventMode.WARFARE,
          operationalArea: bad,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('forwards a valid body to the service', async () => {
      service.create.mockResolvedValue(VIEW);
      await controller.create(ADMIN, {
        name: 'OP Sentinel',
        mode: EventMode.WARFARE,
        operationalArea: POLYGON,
      });
      expect(service.create).toHaveBeenCalledWith(
        ADMIN.id,
        expect.objectContaining({ name: 'OP Sentinel', mode: EventMode.WARFARE }),
      );
    });
  });

  describe('GET /events', () => {
    it('passes status filter through', async () => {
      service.list.mockResolvedValue([VIEW]);
      await controller.list({ status: EventStatus.ACTIVE });
      expect(service.list).toHaveBeenCalledWith({ status: EventStatus.ACTIVE });
    });

    it('rejects unknown status enum', async () => {
      await expect(controller.list({ status: 'WRONG' })).rejects.toThrow(BadRequestException);
    });

    it('handles empty query', async () => {
      service.list.mockResolvedValue([]);
      await controller.list(undefined);
      expect(service.list).toHaveBeenCalledWith({});
    });
  });

  describe('GET /events/:id', () => {
    it('rejects non-UUID id', async () => {
      await expect(controller.getById({ id: 'no' })).rejects.toThrow(BadRequestException);
    });

    it('forwards parsed UUID', async () => {
      service.getById.mockResolvedValue(VIEW);
      await controller.getById({ id: VIEW.id });
      expect(service.getById).toHaveBeenCalledWith(VIEW.id);
    });
  });

  describe('PATCH /events/:id', () => {
    it('rejects empty body', async () => {
      await expect(controller.update({ id: VIEW.id }, {})).rejects.toThrow(BadRequestException);
    });

    it('forwards parsed partial', async () => {
      service.update.mockResolvedValue(VIEW);
      await controller.update({ id: VIEW.id }, { name: 'Renamed' });
      expect(service.update).toHaveBeenCalledWith(VIEW.id, { name: 'Renamed' });
    });
  });

  describe('lifecycle endpoints', () => {
    it('POST /events/:id/activate', async () => {
      service.activate.mockResolvedValue(VIEW);
      await controller.activate({ id: VIEW.id });
      expect(service.activate).toHaveBeenCalledWith(VIEW.id);
    });

    it('POST /events/:id/end', async () => {
      service.end.mockResolvedValue(VIEW);
      await controller.end({ id: VIEW.id });
      expect(service.end).toHaveBeenCalledWith(VIEW.id);
    });
  });

  describe('DELETE /events/:id', () => {
    it('forwards parsed UUID', async () => {
      service.remove.mockResolvedValue(undefined);
      await controller.remove({ id: VIEW.id });
      expect(service.remove).toHaveBeenCalledWith(VIEW.id);
    });
  });
});
