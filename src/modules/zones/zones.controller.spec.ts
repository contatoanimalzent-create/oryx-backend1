import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GeoPolygon } from '../../shared/geo/geo.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZonesController } from './zones.controller';
import { ZonesService } from './zones.service';

const EVENT_ID = '11111111-1111-1111-1111-111111111111';
const ZONE_ID = '22222222-2222-2222-2222-222222222222';

const POLY: GeoPolygon = {
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
  id: ZONE_ID,
  eventId: EVENT_ID,
  name: 'CP-1',
  description: null,
  boundary: POLY,
  createdAt: '2026-05-04T13:00:00.000Z',
  updatedAt: '2026-05-04T13:00:00.000Z',
};

describe('ZonesController', () => {
  let controller: ZonesController;
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
      controllers: [ZonesController],
      providers: [{ provide: ZonesService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(ZonesController);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /events/:eventId/zones', () => {
    it('rejects non-UUID eventId', async () => {
      await expect(
        controller.create({ eventId: 'no' }, { name: 'CP-1', boundary: POLY }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects open Polygon (first != last)', async () => {
      const open = {
        type: 'Polygon',
        coordinates: [
          [
            [-46.65, -23.55],
            [-46.62, -23.55],
            [-46.62, -23.52],
            [-46.65, -23.52],
          ],
        ],
      };
      await expect(
        controller.create({ eventId: EVENT_ID }, { name: 'CP-1', boundary: open }),
      ).rejects.toThrow(BadRequestException);
    });

    it('forwards parsed body', async () => {
      service.createForEvent.mockResolvedValue(VIEW);
      await controller.create({ eventId: EVENT_ID }, { name: 'CP-1', boundary: POLY });
      expect(service.createForEvent).toHaveBeenCalledWith(EVENT_ID, {
        name: 'CP-1',
        boundary: POLY,
      });
    });
  });

  describe('GET /events/:eventId/zones', () => {
    it('forwards eventId', async () => {
      service.listByEvent.mockResolvedValue([VIEW]);
      await controller.listByEvent({ eventId: EVENT_ID });
      expect(service.listByEvent).toHaveBeenCalledWith(EVENT_ID);
    });
  });

  describe('GET /zones/:id', () => {
    it('forwards parsed id', async () => {
      service.getById.mockResolvedValue(VIEW);
      await controller.getById({ id: ZONE_ID });
      expect(service.getById).toHaveBeenCalledWith(ZONE_ID);
    });
  });

  describe('PATCH /zones/:id', () => {
    it('rejects empty body', async () => {
      await expect(controller.update({ id: ZONE_ID }, {})).rejects.toThrow(BadRequestException);
    });

    it('forwards partial', async () => {
      service.update.mockResolvedValue(VIEW);
      await controller.update({ id: ZONE_ID }, { description: 'updated' });
      expect(service.update).toHaveBeenCalledWith(ZONE_ID, { description: 'updated' });
    });
  });

  describe('DELETE /zones/:id', () => {
    it('forwards parsed id', async () => {
      service.remove.mockResolvedValue(undefined);
      await controller.remove({ id: ZONE_ID });
      expect(service.remove).toHaveBeenCalledWith(ZONE_ID);
    });
  });
});
