import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../../shared/database/prisma.service';
import { AnalyticsService } from './analytics.service';

const EVENT_ID = '11111111-1111-1111-1111-111111111111';
const OP_A = '22222222-2222-2222-2222-222222222222';
const OP_B = '33333333-3333-3333-3333-333333333333';
const SQUAD_ID = '44444444-4444-4444-4444-444444444444';
const TEAM_ID = '55555555-5555-5555-5555-555555555555';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
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
      providers: [AnalyticsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(AnalyticsService);
  });

  afterEach(() => vi.restoreAllMocks());

  // ─── operators ─────────────────────────────────────────────────────────

  describe('getOperatorsByEvent', () => {
    it('throws NotFound when the event does not exist', async () => {
      prisma.event.findUnique.mockResolvedValueOnce(null);
      await expect(service.getOperatorsByEvent(EVENT_ID)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('maps bigints + floats to number and computes efficiency from totals', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          operator_id: OP_A,
          callsign: 'Alpha',
          missions_attempted: 4n,
          missions_completed: 3n,
          points_earned: 150n,
          total_mission_seconds: 612.5,
          position_fixes: 240n,
          active_time_seconds: 3_540.25,
          squad_id: SQUAD_ID,
          squad_name: 'Alpha Squad',
          team_id: TEAM_ID,
          team_name: 'Red',
        },
        {
          operator_id: OP_B,
          callsign: 'Bravo',
          missions_attempted: 0n,
          missions_completed: 0n,
          points_earned: 0n,
          total_mission_seconds: 0,
          position_fixes: 12n,
          active_time_seconds: 45,
          squad_id: null,
          squad_name: null,
          team_id: null,
          team_name: null,
        },
      ]);

      const rows = await service.getOperatorsByEvent(EVENT_ID);

      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({
        operatorId: OP_A,
        callsign: 'Alpha',
        missionsAttempted: 4,
        missionsCompleted: 3,
        efficiency: 0.75,
        pointsEarned: 150,
        totalMissionSeconds: 612.5,
        activeTimeSeconds: 3_540.25,
        positionFixes: 240,
        squadId: SQUAD_ID,
        squadName: 'Alpha Squad',
        teamId: TEAM_ID,
        teamName: 'Red',
      });
      // No missions attempted → efficiency must be 0, NOT NaN.
      expect(rows[1].efficiency).toBe(0);
      expect(rows[1].squadId).toBeNull();
    });

    it('returns empty array for an event with no participants', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]);
      const rows = await service.getOperatorsByEvent(EVENT_ID);
      expect(rows).toEqual([]);
    });

    it('clamps efficiency to 1 when completed > attempted (defensive)', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          operator_id: OP_A,
          callsign: 'X',
          missions_attempted: 2n,
          missions_completed: 5n,
          points_earned: 0n,
          total_mission_seconds: 0,
          position_fixes: 0n,
          active_time_seconds: 0,
          squad_id: null,
          squad_name: null,
          team_id: null,
          team_name: null,
        },
      ]);
      const rows = await service.getOperatorsByEvent(EVENT_ID);
      expect(rows[0].efficiency).toBe(1);
    });
  });

  // ─── squads ────────────────────────────────────────────────────────────

  describe('getSquadsByEvent', () => {
    it('throws NotFound when the event does not exist', async () => {
      prisma.event.findUnique.mockResolvedValueOnce(null);
      await expect(service.getSquadsByEvent(EVENT_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('aggregates member metrics and recomputes efficiency from totals', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          squad_id: SQUAD_ID,
          squad_name: 'Alpha',
          team_id: TEAM_ID,
          team_name: 'Red',
          member_count: 3n,
          missions_attempted: 10n,
          missions_completed: 7n,
          points_earned: 350n,
          total_mission_seconds: 1_200.5,
          position_fixes: 720n,
        },
      ]);
      const rows = await service.getSquadsByEvent(EVENT_ID);
      expect(rows[0]).toEqual({
        squadId: SQUAD_ID,
        squadName: 'Alpha',
        teamId: TEAM_ID,
        teamName: 'Red',
        memberCount: 3,
        missionsAttempted: 10,
        missionsCompleted: 7,
        efficiency: 0.7,
        pointsEarned: 350,
        totalMissionSeconds: 1_200.5,
        positionFixes: 720,
      });
    });

    it('handles a squad with zero member activity (efficiency=0)', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          squad_id: SQUAD_ID,
          squad_name: 'Idle',
          team_id: TEAM_ID,
          team_name: 'Red',
          member_count: 2n,
          missions_attempted: 0n,
          missions_completed: 0n,
          points_earned: 0n,
          total_mission_seconds: 0,
          position_fixes: 0n,
        },
      ]);
      const rows = await service.getSquadsByEvent(EVENT_ID);
      expect(rows[0].efficiency).toBe(0);
      expect(rows[0].memberCount).toBe(2);
    });
  });
});
