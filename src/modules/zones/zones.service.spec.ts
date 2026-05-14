import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventStatus } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GeoPolygon } from '../../shared/geo/geo.dto';
import { PrismaService } from '../../shared/database/prisma.service';
import { ZonesRepository } from './zones.repository';
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

const draftEvent = { id: EVENT_ID, status: EventStatus.DRAFT };
const activeEvent = { id: EVENT_ID, status: EventStatus.ACTIVE };
const endedEvent = { id: EVENT_ID, status: EventStatus.ENDED };

const baseZone = {
  id: ZONE_ID,
  eventId: EVENT_ID,
  name: 'CP-1',
  description: null,
  boundary: POLY,
  createdAt: new Date('2026-05-04T13:00:00Z'),
  updatedAt: new Date('2026-05-04T13:00:00Z'),
};

describe('ZonesService', () => {
  let service: ZonesService;
  let repo: {
    findById: ReturnType<typeof vi.fn>;
    findByEventAndName: ReturnType<typeof vi.fn>;
    listByEvent: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    updateById: ReturnType<typeof vi.fn>;
    deleteById: ReturnType<typeof vi.fn>;
  };
  let prisma: { event: { findUnique: ReturnType<typeof vi.fn> } };

  beforeEach(async () => {
    repo = {
      findById: vi.fn(),
      findByEventAndName: vi.fn(),
      listByEvent: vi.fn(),
      create: vi.fn(),
      updateById: vi.fn(),
      deleteById: vi.fn(),
    };
    prisma = { event: { findUnique: vi.fn() } };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ZonesService,
        { provide: ZonesRepository, useValue: repo },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(ZonesService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createForEvent', () => {
    it('creates zone in DRAFT/ACTIVE', async () => {
      for (const event of [draftEvent, activeEvent]) {
        prisma.event.findUnique.mockResolvedValueOnce(event);
        repo.findByEventAndName.mockResolvedValueOnce(null);
        repo.create.mockResolvedValueOnce(baseZone);
        await expect(
          service.createForEvent(EVENT_ID, { name: 'CP-1', boundary: POLY }),
        ).resolves.toBeDefined();
      }
    });

    it('refuses on ENDED event', async () => {
      prisma.event.findUnique.mockResolvedValue(endedEvent);
      await expect(
        service.createForEvent(EVENT_ID, { name: 'CP-1', boundary: POLY }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects 404 when event missing', async () => {
      prisma.event.findUnique.mockResolvedValue(null);
      await expect(
        service.createForEvent(EVENT_ID, { name: 'CP-1', boundary: POLY }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects duplicate name within event', async () => {
      prisma.event.findUnique.mockResolvedValue(draftEvent);
      repo.findByEventAndName.mockResolvedValue(baseZone);
      await expect(
        service.createForEvent(EVENT_ID, { name: 'CP-1', boundary: POLY }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('listByEvent', () => {
    it('returns array', async () => {
      prisma.event.findUnique.mockResolvedValue(draftEvent);
      repo.listByEvent.mockResolvedValue([baseZone]);
      const result = await service.listByEvent(EVENT_ID);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(ZONE_ID);
    });

    it('throws 404 when event missing', async () => {
      prisma.event.findUnique.mockResolvedValue(null);
      await expect(service.listByEvent(EVENT_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates in DRAFT/ACTIVE', async () => {
      for (const event of [draftEvent, activeEvent]) {
        repo.findById.mockResolvedValueOnce(baseZone);
        prisma.event.findUnique.mockResolvedValueOnce(event);
        repo.updateById.mockResolvedValueOnce({ ...baseZone, description: 'updated' });
        await expect(service.update(ZONE_ID, { description: 'updated' })).resolves.toBeDefined();
      }
    });

    it('refuses on ENDED', async () => {
      repo.findById.mockResolvedValue(baseZone);
      prisma.event.findUnique.mockResolvedValue(endedEvent);
      await expect(service.update(ZONE_ID, { description: 'x' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects duplicate name change', async () => {
      repo.findById.mockResolvedValue(baseZone);
      prisma.event.findUnique.mockResolvedValue(draftEvent);
      repo.findByEventAndName.mockResolvedValue({ ...baseZone, id: 'other' });
      await expect(service.update(ZONE_ID, { name: 'CP-2' })).rejects.toThrow(ConflictException);
    });

    it('skips collision check when name unchanged', async () => {
      repo.findById.mockResolvedValue(baseZone);
      prisma.event.findUnique.mockResolvedValue(draftEvent);
      repo.updateById.mockResolvedValue(baseZone);
      await service.update(ZONE_ID, { name: 'CP-1' });
      expect(repo.findByEventAndName).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes in DRAFT', async () => {
      repo.findById.mockResolvedValue(baseZone);
      prisma.event.findUnique.mockResolvedValue(draftEvent);
      repo.deleteById.mockResolvedValue(baseZone);
      await service.remove(ZONE_ID);
      expect(repo.deleteById).toHaveBeenCalledWith(ZONE_ID);
    });

    it('refuses in ACTIVE/ENDED', async () => {
      for (const event of [activeEvent, endedEvent]) {
        repo.findById.mockResolvedValueOnce(baseZone);
        prisma.event.findUnique.mockResolvedValueOnce(event);
        await expect(service.remove(ZONE_ID)).rejects.toThrow(ConflictException);
      }
    });

    it('throws 404 when zone missing', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.remove(ZONE_ID)).rejects.toThrow(NotFoundException);
    });
  });
});
