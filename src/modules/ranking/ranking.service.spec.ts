import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../../shared/database/prisma.service';
import { RankingService } from './ranking.service';

const EVENT_ID = '11111111-1111-1111-1111-111111111111';
const OP_A = '22222222-2222-2222-2222-222222222222';
const OP_B = '33333333-3333-3333-3333-333333333333';
const SQUAD_ID = '44444444-4444-4444-4444-444444444444';
const TEAM_ID = '55555555-5555-5555-5555-555555555555';

describe('RankingService', () => {
  let service: RankingService;
  let prisma: {
    event: { findUnique: ReturnType<typeof vi.fn> };
    $queryRaw: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    prisma = {
      event: { findUnique: vi.fn().mockResolvedValue({ id: EVENT_ID }) },
      $queryRaw: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [RankingService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(RankingService);
  });

  afterEach(() => vi.restoreAllMocks());

  // ─── operators ────────────────────────────────────────────────────────────

  describe('getOperatorsByEvent', () => {
    it('throws NotFound when event does not exist', async () => {
      prisma.event.findUnique.mockResolvedValueOnce(null);
      await expect(service.getOperatorsByEvent(EVENT_ID, { limit: 50 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('converts bigint columns to number and preserves order', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          operator_id: OP_A,
          callsign: 'Alpha',
          points: 150n,
          missions_completed: 3n,
          squad_id: SQUAD_ID,
          squad_name: 'Bravo Squad',
          team_id: TEAM_ID,
          team_name: 'Red Faction',
        },
        {
          operator_id: OP_B,
          callsign: 'Bravo',
          points: 50n,
          missions_completed: 1n,
          squad_id: null,
          squad_name: null,
          team_id: null,
          team_name: null,
        },
      ]);

      const rows = await service.getOperatorsByEvent(EVENT_ID, { limit: 50 });
      expect(rows).toEqual([
        {
          operatorId: OP_A,
          callsign: 'Alpha',
          points: 150,
          missionsCompleted: 3,
          squadId: SQUAD_ID,
          squadName: 'Bravo Squad',
          teamId: TEAM_ID,
          teamName: 'Red Faction',
        },
        {
          operatorId: OP_B,
          callsign: 'Bravo',
          points: 50,
          missionsCompleted: 1,
          squadId: null,
          squadName: null,
          teamId: null,
          teamName: null,
        },
      ]);
    });

    it('returns empty list when no completions exist', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]);
      await expect(service.getOperatorsByEvent(EVENT_ID, { limit: 50 })).resolves.toEqual([]);
    });
  });

  // ─── squads ───────────────────────────────────────────────────────────────

  describe('getSquadsByEvent', () => {
    it('throws NotFound when event does not exist', async () => {
      prisma.event.findUnique.mockResolvedValueOnce(null);
      await expect(service.getSquadsByEvent(EVENT_ID, { limit: 50 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('coerces nullable aggregates to 0 and bigints to number', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          squad_id: SQUAD_ID,
          squad_name: 'Bravo Squad',
          team_id: TEAM_ID,
          team_name: 'Red Faction',
          points: 200n,
          missions_completed: 4n,
          member_count: 5n,
        },
        {
          // squad with no completions: SUM/COUNT come back as 0 (the COALESCE
          // in the query already protects us, but coverage is cheap).
          squad_id: '66666666-6666-6666-6666-666666666666',
          squad_name: 'Charlie Squad',
          team_id: TEAM_ID,
          team_name: 'Red Faction',
          points: null,
          missions_completed: null,
          member_count: 0n,
        },
      ]);

      const rows = await service.getSquadsByEvent(EVENT_ID, { limit: 50 });
      expect(rows[0]).toMatchObject({
        squadId: SQUAD_ID,
        points: 200,
        missionsCompleted: 4,
        memberCount: 5,
      });
      expect(rows[1]).toMatchObject({
        points: 0,
        missionsCompleted: 0,
        memberCount: 0,
      });
    });
  });

  // ─── teams ────────────────────────────────────────────────────────────────

  describe('getTeamsByEvent', () => {
    it('throws NotFound when event does not exist', async () => {
      prisma.event.findUnique.mockResolvedValueOnce(null);
      await expect(service.getTeamsByEvent(EVENT_ID, { limit: 50 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns teams with color and operator_count', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          team_id: TEAM_ID,
          team_name: 'Red Faction',
          color: '#ff0000',
          points: 500n,
          missions_completed: 8n,
          operator_count: 12n,
        },
      ]);

      const rows = await service.getTeamsByEvent(EVENT_ID, { limit: 50 });
      expect(rows).toEqual([
        {
          teamId: TEAM_ID,
          teamName: 'Red Faction',
          color: '#ff0000',
          points: 500,
          missionsCompleted: 8,
          operatorCount: 12,
        },
      ]);
    });

    it('handles team with no completions gracefully', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          team_id: TEAM_ID,
          team_name: 'Empty Faction',
          color: '#000000',
          points: null,
          missions_completed: null,
          operator_count: 0n,
        },
      ]);
      const rows = await service.getTeamsByEvent(EVENT_ID, { limit: 50 });
      expect(rows[0]).toMatchObject({ points: 0, missionsCompleted: 0, operatorCount: 0 });
    });
  });
});
