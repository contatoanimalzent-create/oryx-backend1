import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventStatus } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../../shared/database/prisma.service';
import { TeamsRepository } from './teams.repository';
import { TeamsService } from './teams.service';

const EVENT_ID = '11111111-1111-1111-1111-111111111111';
const TEAM_ID = '22222222-2222-2222-2222-222222222222';

const draftEvent = {
  id: EVENT_ID,
  status: EventStatus.DRAFT,
};
const activeEvent = { id: EVENT_ID, status: EventStatus.ACTIVE };
const endedEvent = { id: EVENT_ID, status: EventStatus.ENDED };

const baseTeam = {
  id: TEAM_ID,
  eventId: EVENT_ID,
  name: 'Wolves',
  color: '#3366ff',
  emblem: null,
  description: null,
  createdAt: new Date('2026-05-03T21:00:00Z'),
  updatedAt: new Date('2026-05-03T21:00:00Z'),
};

describe('TeamsService', () => {
  let service: TeamsService;
  let repo: {
    findById: ReturnType<typeof vi.fn>;
    findByEventAndName: ReturnType<typeof vi.fn>;
    listByEvent: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    updateById: ReturnType<typeof vi.fn>;
    deleteById: ReturnType<typeof vi.fn>;
  };
  let prismaEvent: { findUnique: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    repo = {
      findById: vi.fn(),
      findByEventAndName: vi.fn(),
      listByEvent: vi.fn(),
      create: vi.fn(),
      updateById: vi.fn(),
      deleteById: vi.fn(),
    };
    prismaEvent = { findUnique: vi.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TeamsService,
        { provide: TeamsRepository, useValue: repo },
        { provide: PrismaService, useValue: { event: prismaEvent } },
      ],
    }).compile();
    service = moduleRef.get(TeamsService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── createForEvent ──────────────────────────────────────────────────────

  describe('createForEvent', () => {
    it('creates a team in DRAFT', async () => {
      prismaEvent.findUnique.mockResolvedValue(draftEvent);
      repo.findByEventAndName.mockResolvedValue(null);
      repo.create.mockResolvedValue(baseTeam);

      const result = await service.createForEvent(EVENT_ID, {
        name: 'Wolves',
        color: '#3366ff',
      });
      expect(result.name).toBe('Wolves');
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ eventId: EVENT_ID, name: 'Wolves', color: '#3366ff' }),
      );
    });

    it('creates a team in ACTIVE (allowed)', async () => {
      prismaEvent.findUnique.mockResolvedValue(activeEvent);
      repo.findByEventAndName.mockResolvedValue(null);
      repo.create.mockResolvedValue(baseTeam);
      await expect(
        service.createForEvent(EVENT_ID, { name: 'Wolves', color: '#3366ff' }),
      ).resolves.toBeDefined();
    });

    it('refuses when event is ENDED', async () => {
      prismaEvent.findUnique.mockResolvedValue(endedEvent);
      await expect(
        service.createForEvent(EVENT_ID, { name: 'Wolves', color: '#3366ff' }),
      ).rejects.toThrow(ConflictException);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('returns 404 when event does not exist', async () => {
      prismaEvent.findUnique.mockResolvedValue(null);
      await expect(
        service.createForEvent(EVENT_ID, { name: 'Wolves', color: '#3366ff' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects duplicate name within the event', async () => {
      prismaEvent.findUnique.mockResolvedValue(draftEvent);
      repo.findByEventAndName.mockResolvedValue(baseTeam);
      await expect(
        service.createForEvent(EVENT_ID, { name: 'Wolves', color: '#3366ff' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── listByEvent ─────────────────────────────────────────────────────────

  describe('listByEvent', () => {
    it('returns teams for an existing event', async () => {
      prismaEvent.findUnique.mockResolvedValue(draftEvent);
      repo.listByEvent.mockResolvedValue([baseTeam]);
      const result = await service.listByEvent(EVENT_ID);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(baseTeam.id);
    });

    it('throws 404 when event does not exist', async () => {
      prismaEvent.findUnique.mockResolvedValue(null);
      await expect(service.listByEvent(EVENT_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates while event is DRAFT', async () => {
      repo.findById.mockResolvedValue(baseTeam);
      prismaEvent.findUnique.mockResolvedValue(draftEvent);
      repo.updateById.mockResolvedValue({ ...baseTeam, color: '#ff0000' });
      const result = await service.update(TEAM_ID, { color: '#ff0000' });
      expect(result.color).toBe('#ff0000');
    });

    it('updates while event is ACTIVE (allowed)', async () => {
      repo.findById.mockResolvedValue(baseTeam);
      prismaEvent.findUnique.mockResolvedValue(activeEvent);
      repo.updateById.mockResolvedValue(baseTeam);
      await expect(service.update(TEAM_ID, { color: '#ff0000' })).resolves.toBeDefined();
    });

    it('refuses when event is ENDED', async () => {
      repo.findById.mockResolvedValue(baseTeam);
      prismaEvent.findUnique.mockResolvedValue(endedEvent);
      await expect(service.update(TEAM_ID, { color: '#ff0000' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects duplicate name change', async () => {
      repo.findById.mockResolvedValue(baseTeam);
      prismaEvent.findUnique.mockResolvedValue(draftEvent);
      repo.findByEventAndName.mockResolvedValue({ ...baseTeam, id: 'other' });
      await expect(service.update(TEAM_ID, { name: 'Sharks' })).rejects.toThrow(ConflictException);
    });

    it('skips collision check when name is unchanged', async () => {
      repo.findById.mockResolvedValue(baseTeam);
      prismaEvent.findUnique.mockResolvedValue(draftEvent);
      repo.updateById.mockResolvedValue(baseTeam);
      await service.update(TEAM_ID, { name: 'Wolves' });
      expect(repo.findByEventAndName).not.toHaveBeenCalled();
    });
  });

  // ─── remove ──────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes team in DRAFT', async () => {
      repo.findById.mockResolvedValue(baseTeam);
      prismaEvent.findUnique.mockResolvedValue(draftEvent);
      repo.deleteById.mockResolvedValue(baseTeam);
      await service.remove(TEAM_ID);
      expect(repo.deleteById).toHaveBeenCalledWith(TEAM_ID);
    });

    it('refuses to delete in ACTIVE or ENDED', async () => {
      for (const event of [activeEvent, endedEvent]) {
        repo.findById.mockResolvedValueOnce(baseTeam);
        prismaEvent.findUnique.mockResolvedValueOnce(event);
        await expect(service.remove(TEAM_ID)).rejects.toThrow(ConflictException);
      }
      expect(repo.deleteById).not.toHaveBeenCalled();
    });

    it('throws 404 when team does not exist', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.remove(TEAM_ID)).rejects.toThrow(NotFoundException);
    });
  });
});
