import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventStatus, SquadStatus } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../../shared/database/prisma.service';
import { SquadsRepository } from './squads.repository';
import { SquadsService } from './squads.service';

const EVENT_ID = '11111111-1111-1111-1111-111111111111';
const TEAM_ID = '22222222-2222-2222-2222-222222222222';
const SQUAD_ID = '33333333-3333-3333-3333-333333333333';
const OPERATOR_ID = '44444444-4444-4444-4444-444444444444';

const draftEvent = { id: EVENT_ID, status: EventStatus.DRAFT };
const activeEvent = { id: EVENT_ID, status: EventStatus.ACTIVE };
const endedEvent = { id: EVENT_ID, status: EventStatus.ENDED };

const baseSquad = {
  id: SQUAD_ID,
  teamId: TEAM_ID,
  name: 'Alpha',
  description: null,
  leaderId: null,
  status: SquadStatus.ACTIVE,
  createdAt: new Date('2026-05-03T22:00:00Z'),
  updatedAt: new Date('2026-05-03T22:00:00Z'),
};

describe('SquadsService', () => {
  let service: SquadsService;
  let repo: {
    findById: ReturnType<typeof vi.fn>;
    findByIdWithMembers: ReturnType<typeof vi.fn>;
    findByTeamAndName: ReturnType<typeof vi.fn>;
    listByTeamWithMembers: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    updateById: ReturnType<typeof vi.fn>;
    deleteById: ReturnType<typeof vi.fn>;
    findMember: ReturnType<typeof vi.fn>;
    findActiveMembershipInEvent: ReturnType<typeof vi.fn>;
    createMember: ReturnType<typeof vi.fn>;
    deleteMember: ReturnType<typeof vi.fn>;
  };
  let prisma: {
    team: { findUnique: ReturnType<typeof vi.fn> };
    operator: { findUnique: ReturnType<typeof vi.fn> };
    squadMember: { delete: ReturnType<typeof vi.fn> };
    squad: { update: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    repo = {
      findById: vi.fn(),
      findByIdWithMembers: vi.fn(),
      findByTeamAndName: vi.fn(),
      listByTeamWithMembers: vi.fn(),
      create: vi.fn(),
      updateById: vi.fn(),
      deleteById: vi.fn(),
      findMember: vi.fn(),
      findActiveMembershipInEvent: vi.fn(),
      createMember: vi.fn(),
      deleteMember: vi.fn(),
    };
    prisma = {
      team: { findUnique: vi.fn() },
      operator: { findUnique: vi.fn() },
      squadMember: { delete: vi.fn() },
      squad: { update: vi.fn() },
      $transaction: vi
        .fn()
        .mockImplementation((cb: (tx: unknown) => Promise<unknown>) => cb(prisma)),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SquadsService,
        { provide: SquadsRepository, useValue: repo },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(SquadsService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── createForTeam ──────────────────────────────────────────────────────

  describe('createForTeam', () => {
    it('creates a squad in DRAFT event', async () => {
      prisma.team.findUnique.mockResolvedValue({ id: TEAM_ID, event: draftEvent });
      repo.findByTeamAndName.mockResolvedValue(null);
      repo.create.mockResolvedValue(baseSquad);

      const result = await service.createForTeam(TEAM_ID, { name: 'Alpha' });

      expect(result.name).toBe('Alpha');
      expect(result.members).toEqual([]);
      expect(repo.create).toHaveBeenCalledWith({ teamId: TEAM_ID, name: 'Alpha' });
    });

    it('refuses on ENDED event', async () => {
      prisma.team.findUnique.mockResolvedValue({ id: TEAM_ID, event: endedEvent });
      await expect(service.createForTeam(TEAM_ID, { name: 'Alpha' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects duplicate squad name within team', async () => {
      prisma.team.findUnique.mockResolvedValue({ id: TEAM_ID, event: draftEvent });
      repo.findByTeamAndName.mockResolvedValue(baseSquad);
      await expect(service.createForTeam(TEAM_ID, { name: 'Alpha' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('returns 404 when team is missing', async () => {
      prisma.team.findUnique.mockResolvedValue(null);
      await expect(service.createForTeam(TEAM_ID, { name: 'Alpha' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── update ─────────────────────────────────────────────────────────────

  describe('update', () => {
    it('rejects DISBANDED -> ACTIVE transition', async () => {
      repo.findById.mockResolvedValue({ ...baseSquad, status: SquadStatus.DISBANDED });
      prisma.team.findUnique.mockResolvedValue({ id: TEAM_ID, event: activeEvent });

      await expect(service.update(SQUAD_ID, { status: SquadStatus.ACTIVE })).rejects.toThrow(
        ConflictException,
      );
    });

    it('allows ACTIVE -> INACTIVE', async () => {
      repo.findById.mockResolvedValue(baseSquad);
      prisma.team.findUnique.mockResolvedValue({ id: TEAM_ID, event: activeEvent });
      repo.updateById.mockResolvedValue({ ...baseSquad, status: SquadStatus.INACTIVE });
      repo.findByIdWithMembers.mockResolvedValue({
        ...baseSquad,
        status: SquadStatus.INACTIVE,
        members: [],
      });

      const result = await service.update(SQUAD_ID, { status: SquadStatus.INACTIVE });
      expect(result.status).toBe(SquadStatus.INACTIVE);
    });

    it('rejects leader who is not a member', async () => {
      repo.findById.mockResolvedValue(baseSquad);
      prisma.team.findUnique.mockResolvedValue({ id: TEAM_ID, event: draftEvent });
      repo.findMember.mockResolvedValue(null);

      await expect(service.update(SQUAD_ID, { leaderId: OPERATOR_ID })).rejects.toThrow(
        ConflictException,
      );
      expect(repo.updateById).not.toHaveBeenCalled();
    });

    it('accepts leader when they are a member', async () => {
      repo.findById.mockResolvedValue(baseSquad);
      prisma.team.findUnique.mockResolvedValue({ id: TEAM_ID, event: draftEvent });
      repo.findMember.mockResolvedValue({ squadId: SQUAD_ID, operatorId: OPERATOR_ID });
      repo.updateById.mockResolvedValue({ ...baseSquad, leaderId: OPERATOR_ID });
      repo.findByIdWithMembers.mockResolvedValue({
        ...baseSquad,
        leaderId: OPERATOR_ID,
        members: [],
      });

      const result = await service.update(SQUAD_ID, { leaderId: OPERATOR_ID });
      expect(result.leaderId).toBe(OPERATOR_ID);
    });

    it('refuses edits in ENDED event', async () => {
      repo.findById.mockResolvedValue(baseSquad);
      prisma.team.findUnique.mockResolvedValue({ id: TEAM_ID, event: endedEvent });
      await expect(service.update(SQUAD_ID, { name: 'Bravo' })).rejects.toThrow(ConflictException);
    });
  });

  // ─── remove ─────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes in DRAFT', async () => {
      repo.findById.mockResolvedValue(baseSquad);
      prisma.team.findUnique.mockResolvedValue({ id: TEAM_ID, event: draftEvent });
      repo.deleteById.mockResolvedValue(baseSquad);
      await service.remove(SQUAD_ID);
      expect(repo.deleteById).toHaveBeenCalledWith(SQUAD_ID);
    });

    it('refuses in ACTIVE/ENDED', async () => {
      for (const event of [activeEvent, endedEvent]) {
        repo.findById.mockResolvedValueOnce(baseSquad);
        prisma.team.findUnique.mockResolvedValueOnce({ id: TEAM_ID, event });
        await expect(service.remove(SQUAD_ID)).rejects.toThrow(ConflictException);
      }
    });
  });

  // ─── addMember ──────────────────────────────────────────────────────────

  describe('addMember', () => {
    const setupHappyPath = () => {
      repo.findById.mockResolvedValue(baseSquad);
      prisma.team.findUnique.mockResolvedValue({ id: TEAM_ID, event: activeEvent });
      prisma.operator.findUnique.mockResolvedValue({ id: OPERATOR_ID });
      repo.findActiveMembershipInEvent.mockResolvedValue(null);
      repo.findMember.mockResolvedValue(null);
      repo.createMember.mockResolvedValue({});
      repo.findByIdWithMembers.mockResolvedValue({
        ...baseSquad,
        members: [
          {
            squadId: SQUAD_ID,
            operatorId: OPERATOR_ID,
            joinedAt: new Date(),
            operator: { id: OPERATOR_ID, callsign: 'GHOST' },
          },
        ],
      });
    };

    it('adds operator to ACTIVE squad', async () => {
      setupHappyPath();
      const result = await service.addMember(SQUAD_ID, { operatorId: OPERATOR_ID });
      expect(result.members).toHaveLength(1);
      expect(repo.createMember).toHaveBeenCalledWith(SQUAD_ID, OPERATOR_ID);
    });

    it('refuses when squad is DISBANDED', async () => {
      repo.findById.mockResolvedValue({ ...baseSquad, status: SquadStatus.DISBANDED });
      await expect(service.addMember(SQUAD_ID, { operatorId: OPERATOR_ID })).rejects.toThrow(
        ConflictException,
      );
    });

    it('refuses when event is ENDED', async () => {
      repo.findById.mockResolvedValue(baseSquad);
      prisma.team.findUnique.mockResolvedValue({ id: TEAM_ID, event: endedEvent });
      await expect(service.addMember(SQUAD_ID, { operatorId: OPERATOR_ID })).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects when operator is already in another squad of the event', async () => {
      repo.findById.mockResolvedValue(baseSquad);
      prisma.team.findUnique.mockResolvedValue({ id: TEAM_ID, event: activeEvent });
      prisma.operator.findUnique.mockResolvedValue({ id: OPERATOR_ID });
      repo.findActiveMembershipInEvent.mockResolvedValue({
        squadId: 'other-squad',
        operatorId: OPERATOR_ID,
      });

      await expect(service.addMember(SQUAD_ID, { operatorId: OPERATOR_ID })).rejects.toThrow(
        ConflictException,
      );
      expect(repo.createMember).not.toHaveBeenCalled();
    });

    it('rejects duplicate membership in same squad', async () => {
      setupHappyPath();
      repo.findMember.mockResolvedValue({ squadId: SQUAD_ID, operatorId: OPERATOR_ID });
      await expect(service.addMember(SQUAD_ID, { operatorId: OPERATOR_ID })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ─── removeMember ───────────────────────────────────────────────────────

  describe('removeMember', () => {
    it('removes a non-leader member', async () => {
      repo.findById.mockResolvedValue(baseSquad);
      prisma.team.findUnique.mockResolvedValue({ id: TEAM_ID, event: activeEvent });
      repo.findMember.mockResolvedValue({ squadId: SQUAD_ID, operatorId: OPERATOR_ID });

      await service.removeMember(SQUAD_ID, OPERATOR_ID);

      expect(prisma.squadMember.delete).toHaveBeenCalledWith({
        where: { squadId_operatorId: { squadId: SQUAD_ID, operatorId: OPERATOR_ID } },
      });
      expect(prisma.squad.update).not.toHaveBeenCalled();
    });

    it('also clears leaderId when the removed member was the leader', async () => {
      repo.findById.mockResolvedValue({ ...baseSquad, leaderId: OPERATOR_ID });
      prisma.team.findUnique.mockResolvedValue({ id: TEAM_ID, event: activeEvent });
      repo.findMember.mockResolvedValue({ squadId: SQUAD_ID, operatorId: OPERATOR_ID });

      await service.removeMember(SQUAD_ID, OPERATOR_ID);

      expect(prisma.squad.update).toHaveBeenCalledWith({
        where: { id: SQUAD_ID },
        data: { leaderId: null },
      });
    });

    it('returns 404 when not a member', async () => {
      repo.findById.mockResolvedValue(baseSquad);
      prisma.team.findUnique.mockResolvedValue({ id: TEAM_ID, event: activeEvent });
      repo.findMember.mockResolvedValue(null);

      await expect(service.removeMember(SQUAD_ID, OPERATOR_ID)).rejects.toThrow(NotFoundException);
    });

    it('refuses when event is ENDED', async () => {
      repo.findById.mockResolvedValue(baseSquad);
      prisma.team.findUnique.mockResolvedValue({ id: TEAM_ID, event: endedEvent });
      await expect(service.removeMember(SQUAD_ID, OPERATOR_ID)).rejects.toThrow(ConflictException);
    });
  });
});
