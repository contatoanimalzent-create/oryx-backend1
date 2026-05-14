import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventMode, EventStatus, RoundStatus } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../../shared/database/prisma.service';
import { CompetitiveService } from './competitive.service';

const EVENT_ID = '11111111-1111-1111-1111-111111111111';
const TEAM_ID = '22222222-2222-2222-2222-222222222222';
const TEAM_B_ID = '33333333-3333-3333-3333-333333333333';
const ROUND_ID = '44444444-4444-4444-4444-444444444444';
const OP_A = '55555555-5555-5555-5555-555555555555';
const OP_B = '66666666-6666-6666-6666-666666666666';
const ELIM_ID = '77777777-7777-7777-7777-777777777777';

const NOW = new Date('2026-05-12T20:00:00Z');
const LATER = new Date('2026-05-12T20:02:00Z');

describe('CompetitiveService', () => {
  let service: CompetitiveService;
  let prisma: {
    event: { findUnique: ReturnType<typeof vi.fn> };
    team: { findUnique: ReturnType<typeof vi.fn> };
    round: {
      findFirst: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    roundElimination: {
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    squadMember: { findFirst: ReturnType<typeof vi.fn> };
    $queryRaw: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    prisma = {
      event: { findUnique: vi.fn() },
      team: { findUnique: vi.fn() },
      round: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      roundElimination: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
      },
      squadMember: { findFirst: vi.fn() },
      $queryRaw: vi.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [CompetitiveService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(CompetitiveService);
  });

  afterEach(() => vi.restoreAllMocks());

  // ─── Rounds ──────────────────────────────────────────────────────────

  describe('createRound', () => {
    it('rejects non-COMPETITIVE event (400)', async () => {
      prisma.event.findUnique.mockResolvedValueOnce({
        id: EVENT_ID,
        mode: EventMode.WARFARE,
        status: EventStatus.ACTIVE,
      });
      await expect(service.createRound(EVENT_ID, {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects non-ACTIVE event (409)', async () => {
      prisma.event.findUnique.mockResolvedValueOnce({
        id: EVENT_ID,
        mode: EventMode.COMPETITIVE,
        status: EventStatus.DRAFT,
      });
      await expect(service.createRound(EVENT_ID, {})).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects when an ACTIVE round already exists (409)', async () => {
      prisma.event.findUnique.mockResolvedValueOnce({
        id: EVENT_ID,
        mode: EventMode.COMPETITIVE,
        status: EventStatus.ACTIVE,
      });
      prisma.round.findFirst.mockResolvedValueOnce({ id: ROUND_ID, roundNumber: 1 });
      await expect(service.createRound(EVENT_ID, {})).rejects.toBeInstanceOf(ConflictException);
    });

    it('assigns roundNumber = previous max + 1', async () => {
      prisma.event.findUnique.mockResolvedValueOnce({
        id: EVENT_ID,
        mode: EventMode.COMPETITIVE,
        status: EventStatus.ACTIVE,
      });
      prisma.round.findFirst.mockResolvedValueOnce(null); // no active
      prisma.round.findFirst.mockResolvedValueOnce({ roundNumber: 4 }); // latest
      prisma.round.create.mockResolvedValueOnce({
        id: ROUND_ID,
        eventId: EVENT_ID,
        roundNumber: 5,
        status: RoundStatus.ACTIVE,
        startedAt: NOW,
        endedAt: null,
        winningTeamId: null,
        note: null,
        createdAt: NOW,
        updatedAt: NOW,
      });
      const view = await service.createRound(EVENT_ID, {});
      expect(view.roundNumber).toBe(5);
      expect(prisma.round.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ roundNumber: 5 }) }),
      );
    });
  });

  describe('updateRound', () => {
    it('rejects transitioning a non-ACTIVE round', async () => {
      prisma.round.findUnique.mockResolvedValueOnce({
        id: ROUND_ID,
        eventId: EVENT_ID,
        status: RoundStatus.COMPLETED,
      });
      await expect(
        service.updateRound(ROUND_ID, { status: RoundStatus.COMPLETED }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects winningTeamId from a different event', async () => {
      prisma.round.findUnique.mockResolvedValueOnce({
        id: ROUND_ID,
        eventId: EVENT_ID,
        status: RoundStatus.ACTIVE,
      });
      prisma.team.findUnique.mockResolvedValueOnce({ id: TEAM_ID, eventId: 'other-event' });
      await expect(
        service.updateRound(ROUND_ID, {
          status: RoundStatus.COMPLETED,
          winningTeamId: TEAM_ID,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('forces winningTeamId to null on CANCELLED', async () => {
      prisma.round.findUnique.mockResolvedValueOnce({
        id: ROUND_ID,
        eventId: EVENT_ID,
        status: RoundStatus.ACTIVE,
      });
      prisma.round.update.mockResolvedValueOnce({
        id: ROUND_ID,
        eventId: EVENT_ID,
        roundNumber: 1,
        status: RoundStatus.CANCELLED,
        startedAt: NOW,
        endedAt: LATER,
        winningTeamId: null,
        note: 'mistake',
        createdAt: NOW,
        updatedAt: LATER,
        winningTeam: null,
        _count: { eliminations: 0 },
      });
      const view = await service.updateRound(ROUND_ID, {
        status: RoundStatus.CANCELLED,
        winningTeamId: TEAM_ID,
        note: 'mistake',
      });
      // winningTeamId clobbered to null at the service layer.
      expect(prisma.round.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ winningTeamId: null }),
        }),
      );
      expect(view.winningTeamId).toBeNull();
    });

    it('happy COMPLETED with valid winningTeamId computes durationSeconds', async () => {
      prisma.round.findUnique.mockResolvedValueOnce({
        id: ROUND_ID,
        eventId: EVENT_ID,
        status: RoundStatus.ACTIVE,
      });
      prisma.team.findUnique.mockResolvedValueOnce({ id: TEAM_ID, eventId: EVENT_ID });
      prisma.round.update.mockResolvedValueOnce({
        id: ROUND_ID,
        eventId: EVENT_ID,
        roundNumber: 1,
        status: RoundStatus.COMPLETED,
        startedAt: NOW,
        endedAt: LATER,
        winningTeamId: TEAM_ID,
        note: null,
        createdAt: NOW,
        updatedAt: LATER,
        winningTeam: { name: 'Red' },
        _count: { eliminations: 3 },
      });
      const view = await service.updateRound(ROUND_ID, {
        status: RoundStatus.COMPLETED,
        winningTeamId: TEAM_ID,
      });
      expect(view.status).toBe(RoundStatus.COMPLETED);
      expect(view.winningTeamId).toBe(TEAM_ID);
      expect(view.winningTeamName).toBe('Red');
      expect(view.durationSeconds).toBe(120); // 2 min
      expect(view.eliminationCount).toBe(3);
    });
  });

  // ─── Eliminations ─────────────────────────────────────────────────────

  describe('recordElimination', () => {
    it('rejects if round is not ACTIVE', async () => {
      prisma.round.findUnique.mockResolvedValueOnce({
        id: ROUND_ID,
        eventId: EVENT_ID,
        status: RoundStatus.COMPLETED,
      });
      await expect(
        service.recordElimination(ROUND_ID, { eliminatedOperatorId: OP_A }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects when victim is not on the event roster', async () => {
      prisma.round.findUnique.mockResolvedValueOnce({
        id: ROUND_ID,
        eventId: EVENT_ID,
        status: RoundStatus.ACTIVE,
      });
      prisma.squadMember.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.recordElimination(ROUND_ID, { eliminatedOperatorId: OP_A }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when killer is not on the event roster', async () => {
      prisma.round.findUnique.mockResolvedValueOnce({
        id: ROUND_ID,
        eventId: EVENT_ID,
        status: RoundStatus.ACTIVE,
      });
      // victim ok, killer not.
      prisma.squadMember.findFirst.mockResolvedValueOnce({ operatorId: OP_A });
      prisma.squadMember.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.recordElimination(ROUND_ID, {
          eliminatedOperatorId: OP_A,
          eliminatedById: OP_B,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects killer == victim (use null for self-elim)', async () => {
      prisma.round.findUnique.mockResolvedValueOnce({
        id: ROUND_ID,
        eventId: EVENT_ID,
        status: RoundStatus.ACTIVE,
      });
      prisma.squadMember.findFirst.mockResolvedValueOnce({ operatorId: OP_A });
      prisma.squadMember.findFirst.mockResolvedValueOnce({ operatorId: OP_A });
      await expect(
        service.recordElimination(ROUND_ID, {
          eliminatedOperatorId: OP_A,
          eliminatedById: OP_A,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('translates P2002 to 409 (operator already eliminated this round)', async () => {
      prisma.round.findUnique.mockResolvedValueOnce({
        id: ROUND_ID,
        eventId: EVENT_ID,
        status: RoundStatus.ACTIVE,
      });
      prisma.squadMember.findFirst.mockResolvedValueOnce({ operatorId: OP_A });
      const err = Object.assign(new Error('uq'), { code: 'P2002' });
      prisma.roundElimination.create.mockRejectedValueOnce(err);
      await expect(
        service.recordElimination(ROUND_ID, { eliminatedOperatorId: OP_A }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('happy path returns elimination view with callsigns', async () => {
      prisma.round.findUnique.mockResolvedValueOnce({
        id: ROUND_ID,
        eventId: EVENT_ID,
        status: RoundStatus.ACTIVE,
      });
      prisma.squadMember.findFirst.mockResolvedValueOnce({ operatorId: OP_A });
      prisma.squadMember.findFirst.mockResolvedValueOnce({ operatorId: OP_B });
      prisma.roundElimination.create.mockResolvedValueOnce({
        id: ELIM_ID,
        roundId: ROUND_ID,
        eliminatedOperatorId: OP_A,
        eliminatedById: OP_B,
        eliminatedAt: NOW,
        note: null,
        createdAt: NOW,
        eliminated: { callsign: 'ALPHA' },
        killer: { callsign: 'BRAVO' },
      });
      const view = await service.recordElimination(ROUND_ID, {
        eliminatedOperatorId: OP_A,
        eliminatedById: OP_B,
      });
      expect(view).toMatchObject({
        id: ELIM_ID,
        eliminatedCallsign: 'ALPHA',
        killerCallsign: 'BRAVO',
      });
    });
  });

  // ─── Scoreboard ───────────────────────────────────────────────────────

  describe('getScoreboard', () => {
    it('aggregates counts, teams, and operators with kdRatio', async () => {
      prisma.event.findUnique.mockResolvedValueOnce({ id: EVENT_ID });
      prisma.$queryRaw.mockResolvedValueOnce([
        { rounds_played: 3n, rounds_completed: 3n, tied_rounds: 1n },
      ]);
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          team_id: TEAM_ID,
          team_name: 'Red',
          color: '#f00',
          rounds_won: 2n,
          total_kills: 5n,
          total_deaths: 3n,
          operator_count: 5n,
        },
        {
          team_id: TEAM_B_ID,
          team_name: 'Blue',
          color: '#00f',
          rounds_won: 0n,
          total_kills: 3n,
          total_deaths: 5n,
          operator_count: 5n,
        },
      ]);
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          operator_id: OP_A,
          callsign: 'ALPHA',
          team_id: TEAM_ID,
          team_name: 'Red',
          kills: 4n,
          deaths: 2n,
          rounds_played: 3n,
        },
        {
          operator_id: OP_B,
          callsign: 'BRAVO',
          team_id: TEAM_B_ID,
          team_name: 'Blue',
          kills: 0n,
          deaths: 0n,
          rounds_played: 3n,
        },
      ]);

      const view = await service.getScoreboard(EVENT_ID);
      expect(view).toMatchObject({
        roundsPlayed: 3,
        roundsCompleted: 3,
        tiedRounds: 1,
      });
      expect(view.teams[0]).toMatchObject({ teamName: 'Red', roundsWon: 2, totalKills: 5 });
      expect(view.operators[0]).toMatchObject({
        callsign: 'ALPHA',
        kills: 4,
        deaths: 2,
        kd: 2,
        roundsSurvived: 1,
      });
      // 0 kills + 0 deaths → kd=0, not NaN/Infinity.
      expect(view.operators[1].kd).toBe(0);
      expect(view.operators[1].roundsSurvived).toBe(3);
    });

    it('throws NotFound for unknown event', async () => {
      prisma.event.findUnique.mockResolvedValueOnce(null);
      await expect(service.getScoreboard(EVENT_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── MVP ──────────────────────────────────────────────────────────────

  describe('getMvp', () => {
    it('returns roundMvps + matchMvp with kd computed', async () => {
      prisma.event.findUnique.mockResolvedValueOnce({ id: EVENT_ID });
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          round_id: ROUND_ID,
          round_number: 1,
          operator_id: OP_A,
          callsign: 'ALPHA',
          kills: 3n,
          survived: true,
        },
      ]);
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          operator_id: OP_A,
          callsign: 'ALPHA',
          team_id: TEAM_ID,
          team_name: 'Red',
          total_kills: 5n,
          total_deaths: 2n,
        },
      ]);

      const view = await service.getMvp(EVENT_ID);
      expect(view.roundMvps).toHaveLength(1);
      expect(view.roundMvps[0]).toMatchObject({ kills: 3, survived: true });
      expect(view.matchMvp).toMatchObject({
        callsign: 'ALPHA',
        totalKills: 5,
        totalDeaths: 2,
        kd: 2.5,
      });
    });

    it('returns matchMvp=null when no one scored a kill', async () => {
      prisma.event.findUnique.mockResolvedValueOnce({ id: EVENT_ID });
      prisma.$queryRaw.mockResolvedValueOnce([]);
      prisma.$queryRaw.mockResolvedValueOnce([]);
      const view = await service.getMvp(EVENT_ID);
      expect(view.matchMvp).toBeNull();
      expect(view.roundMvps).toEqual([]);
    });
  });
});
