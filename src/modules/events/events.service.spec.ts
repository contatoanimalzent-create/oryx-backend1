import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventMode, EventStatus } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GeoPolygon } from './dto/events.dto';
import { EventsRepository } from './events.repository';
import { EventsService } from './events.service';

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

interface EventRow {
  id: string;
  name: string;
  description: string | null;
  mode: EventMode;
  status: EventStatus;
  operationalArea: unknown;
  startsAt: Date | null;
  endsAt: Date | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const baseEvent: EventRow = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'OP Sentinel',
  description: null,
  mode: EventMode.WARFARE,
  status: EventStatus.DRAFT,
  operationalArea: POLYGON,
  startsAt: null,
  endsAt: null,
  createdById: 'admin-1',
  createdAt: new Date('2026-05-03T20:00:00Z'),
  updatedAt: new Date('2026-05-03T20:00:00Z'),
};

describe('EventsService', () => {
  let service: EventsService;
  let repo: {
    findById: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    updateById: ReturnType<typeof vi.fn>;
    deleteById: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    repo = {
      findById: vi.fn(),
      list: vi.fn(),
      create: vi.fn(),
      updateById: vi.fn(),
      deleteById: vi.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [EventsService, { provide: EventsRepository, useValue: repo }],
    }).compile();
    service = moduleRef.get(EventsService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('create', () => {
    it('persists with status DRAFT and the admin id as creator', async () => {
      repo.create.mockResolvedValue(baseEvent);

      const result = await service.create('admin-1', {
        name: 'OP Sentinel',
        mode: EventMode.WARFARE,
        operationalArea: POLYGON,
      });

      expect(result.status).toBe(EventStatus.DRAFT);
      expect(result.createdById).toBe('admin-1');
      const arg = repo.create.mock.calls[0][0] as Record<string, unknown>;
      expect(arg.createdById).toBe('admin-1');
      // status defaults via DB; service does not set it explicitly.
      expect(arg.status).toBeUndefined();
    });
  });

  describe('list', () => {
    it('passes filters through', async () => {
      repo.list.mockResolvedValue([baseEvent]);
      await service.list({ status: EventStatus.ACTIVE });
      expect(repo.list).toHaveBeenCalledWith({ status: EventStatus.ACTIVE });
    });
  });

  describe('getById', () => {
    it('throws 404 when missing', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.getById('00000000-0000-0000-0000-000000000000')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('allows updates while DRAFT', async () => {
      repo.findById.mockResolvedValue(baseEvent);
      repo.updateById.mockResolvedValue({ ...baseEvent, name: 'OP Renamed' });

      const result = await service.update(baseEvent.id, { name: 'OP Renamed' });

      expect(result.name).toBe('OP Renamed');
      expect(repo.updateById).toHaveBeenCalledWith(baseEvent.id, { name: 'OP Renamed' });
    });

    it('rejects updates outside DRAFT (409)', async () => {
      repo.findById.mockResolvedValue({ ...baseEvent, status: EventStatus.ACTIVE });
      await expect(service.update(baseEvent.id, { name: 'X' })).rejects.toThrow(ConflictException);
      expect(repo.updateById).not.toHaveBeenCalled();
    });
  });

  describe('activate', () => {
    it('moves DRAFT -> ACTIVE and sets startsAt', async () => {
      repo.findById.mockResolvedValue(baseEvent);
      repo.updateById.mockImplementation((_id: string, data: Record<string, unknown>) =>
        Promise.resolve({
          ...baseEvent,
          ...data,
          startsAt: data.startsAt as Date,
        }),
      );

      const before = Date.now();
      const result = await service.activate(baseEvent.id);
      const after = Date.now();

      expect(result.status).toBe(EventStatus.ACTIVE);
      expect(result.startsAt).not.toBeNull();
      const ts = new Date(result.startsAt!).getTime();
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });

    it('rejects activation from ACTIVE or ENDED', async () => {
      for (const status of [EventStatus.ACTIVE, EventStatus.ENDED]) {
        repo.findById.mockResolvedValueOnce({ ...baseEvent, status });
        await expect(service.activate(baseEvent.id)).rejects.toThrow(ConflictException);
      }
      expect(repo.updateById).not.toHaveBeenCalled();
    });
  });

  describe('end', () => {
    it('moves ACTIVE -> ENDED and sets endsAt', async () => {
      repo.findById.mockResolvedValue({ ...baseEvent, status: EventStatus.ACTIVE });
      repo.updateById.mockImplementation((_id: string, data: Record<string, unknown>) =>
        Promise.resolve({
          ...baseEvent,
          status: EventStatus.ACTIVE,
          ...data,
          endsAt: data.endsAt as Date,
        }),
      );

      const result = await service.end(baseEvent.id);

      expect(result.status).toBe(EventStatus.ENDED);
      expect(result.endsAt).not.toBeNull();
    });

    it('rejects end from DRAFT', async () => {
      repo.findById.mockResolvedValue(baseEvent);
      await expect(service.end(baseEvent.id)).rejects.toThrow(ConflictException);
    });

    it('rejects end from ENDED (no double-end)', async () => {
      repo.findById.mockResolvedValue({ ...baseEvent, status: EventStatus.ENDED });
      await expect(service.end(baseEvent.id)).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('deletes a DRAFT', async () => {
      repo.findById.mockResolvedValue(baseEvent);
      repo.deleteById.mockResolvedValue(baseEvent);
      await service.remove(baseEvent.id);
      expect(repo.deleteById).toHaveBeenCalledWith(baseEvent.id);
    });

    it('refuses to delete ACTIVE/ENDED', async () => {
      for (const status of [EventStatus.ACTIVE, EventStatus.ENDED]) {
        repo.findById.mockResolvedValueOnce({ ...baseEvent, status });
        await expect(service.remove(baseEvent.id)).rejects.toThrow(ConflictException);
      }
      expect(repo.deleteById).not.toHaveBeenCalled();
    });
  });
});
