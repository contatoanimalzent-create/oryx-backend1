import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../../shared/database/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { AarService } from './aar.service';

const EVENT_ID = '11111111-1111-1111-1111-111111111111';
const OP_A = '22222222-2222-2222-2222-222222222222';
const MISSION_ID = '33333333-3333-3333-3333-333333333333';
const ZONE_ID = '44444444-4444-4444-4444-444444444444';
const SUS_ID = '55555555-5555-5555-5555-555555555555';
const REP_ID = '66666666-6666-6666-6666-666666666666';
const POS_ID = '77777777-7777-7777-7777-777777777777';

describe('AarService', () => {
  let service: AarService;
  let prisma: {
    event: { findUnique: ReturnType<typeof vi.fn> };
    mission: { findMany: ReturnType<typeof vi.fn> };
    zone: { findMany: ReturnType<typeof vi.fn> };
    positionHistory: { count: ReturnType<typeof vi.fn> };
    $queryRaw: ReturnType<typeof vi.fn>;
  };
  let analytics: { getOperatorsByEvent: ReturnType<typeof vi.fn> };

  const EVENT_ROW = {
    id: EVENT_ID,
    name: 'EV',
    mode: 'WARFARE',
    status: 'ACTIVE',
    startsAt: null,
    endsAt: null,
  };

  beforeEach(async () => {
    prisma = {
      event: { findUnique: vi.fn().mockResolvedValue(EVENT_ROW) },
      mission: { findMany: vi.fn().mockResolvedValue([]) },
      zone: { findMany: vi.fn().mockResolvedValue([]) },
      positionHistory: { count: vi.fn().mockResolvedValue(0) },
      $queryRaw: vi.fn(),
    };
    analytics = { getOperatorsByEvent: vi.fn().mockResolvedValue([]) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AarService,
        { provide: PrismaService, useValue: prisma },
        { provide: AnalyticsService, useValue: analytics },
      ],
    }).compile();
    service = moduleRef.get(AarService);
  });

  afterEach(() => vi.restoreAllMocks());

  // ─── timeline ──────────────────────────────────────────────────────────

  describe('getTimeline', () => {
    it('throws NotFound for unknown event', async () => {
      prisma.event.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.getTimeline(EVENT_ID, { fromAt: null, toAt: null, limit: 200 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('maps three union variants into discriminated payloads', async () => {
      const at1 = new Date('2026-05-12T20:00:00Z');
      const at2 = new Date('2026-05-12T20:01:00Z');
      const at3 = new Date('2026-05-12T20:02:00Z');
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          kind: 'MISSION_COMPLETED',
          at: at1,
          operator_id: OP_A,
          operator_callsign: 'ALPHA',
          mission_id: MISSION_ID,
          mission_name: 'CP-1',
          mission_type: 'CHECKPOINT',
          points_reward: 25,
          suspicion_id: null,
          detector: null,
          cheat_severity: null,
          rep_log_id: null,
          rep_kind: null,
          rep_severity: null,
          rep_reason: null,
          rep_delta: null,
          rep_created_by_id: null,
        },
        {
          kind: 'CHEAT_SUSPICION',
          at: at2,
          operator_id: OP_A,
          operator_callsign: 'ALPHA',
          mission_id: null,
          mission_name: null,
          mission_type: null,
          points_reward: null,
          suspicion_id: SUS_ID,
          detector: 'SPEED_IMPOSSIBLE',
          cheat_severity: 'SEVERE',
          rep_log_id: null,
          rep_kind: null,
          rep_severity: null,
          rep_reason: null,
          rep_delta: null,
          rep_created_by_id: null,
        },
        {
          kind: 'REPUTATION_ENTRY',
          at: at3,
          operator_id: OP_A,
          operator_callsign: 'ALPHA',
          mission_id: null,
          mission_name: null,
          mission_type: null,
          points_reward: null,
          suspicion_id: null,
          detector: null,
          cheat_severity: null,
          rep_log_id: REP_ID,
          rep_kind: 'PENALTY',
          rep_severity: 'SEVERE',
          rep_reason: 'CHEATING',
          rep_delta: -50,
          rep_created_by_id: null,
        },
      ]);

      const rows = await service.getTimeline(EVENT_ID, {
        fromAt: null,
        toAt: null,
        limit: 200,
      });

      expect(rows[0]).toEqual({
        kind: 'MISSION_COMPLETED',
        at: at1.toISOString(),
        operatorId: OP_A,
        operatorCallsign: 'ALPHA',
        payload: {
          missionId: MISSION_ID,
          missionName: 'CP-1',
          missionType: 'CHECKPOINT',
          pointsReward: 25,
        },
      });
      expect(rows[1].kind).toBe('CHEAT_SUSPICION');
      expect(rows[1].payload).toEqual({
        suspicionId: SUS_ID,
        detector: 'SPEED_IMPOSSIBLE',
        severity: 'SEVERE',
      });
      expect(rows[2].kind).toBe('REPUTATION_ENTRY');
      expect(rows[2].payload).toMatchObject({
        logId: REP_ID,
        kind: 'PENALTY',
        delta: -50,
        systemGenerated: true,
      });
    });

    it('returns empty array when nothing matched the filter', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]);
      const rows = await service.getTimeline(EVENT_ID, {
        fromAt: '2026-05-12T00:00:00Z',
        toAt: '2026-05-12T01:00:00Z',
        limit: 200,
      });
      expect(rows).toEqual([]);
    });
  });

  // ─── positions ─────────────────────────────────────────────────────────

  describe('getPositions', () => {
    it('throws NotFound for unknown event', async () => {
      prisma.event.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.getPositions(EVENT_ID, {
          operatorId: null,
          fromAt: null,
          toAt: null,
          cursor: null,
          limit: 500,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns rows with nextCursor=null when result fits the limit', async () => {
      const at = new Date('2026-05-12T20:00:00Z');
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          id: POS_ID,
          operator_id: OP_A,
          operator_callsign: 'ALPHA',
          lat: -23.55,
          lon: -46.62,
          accuracy_m: 5,
          heading_deg: null,
          speed_mps: null,
          recorded_at: at,
        },
      ]);
      const page = await service.getPositions(EVENT_ID, {
        operatorId: null,
        fromAt: null,
        toAt: null,
        cursor: null,
        limit: 500,
      });
      expect(page.rows).toHaveLength(1);
      expect(page.nextCursor).toBeNull();
      expect(page.rows[0].recordedAt).toBe(at.toISOString());
    });

    it('returns nextCursor when result hits limit+1', async () => {
      // limit=2 → fetchLimit=3. Return 3 rows → hasMore=true.
      const t1 = new Date('2026-05-12T20:00:00Z');
      const t2 = new Date('2026-05-12T20:00:01Z');
      const t3 = new Date('2026-05-12T20:00:02Z');
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          id: '1',
          operator_id: OP_A,
          operator_callsign: 'A',
          lat: 0,
          lon: 0,
          accuracy_m: null,
          heading_deg: null,
          speed_mps: null,
          recorded_at: t1,
        },
        {
          id: '2',
          operator_id: OP_A,
          operator_callsign: 'A',
          lat: 0,
          lon: 0,
          accuracy_m: null,
          heading_deg: null,
          speed_mps: null,
          recorded_at: t2,
        },
        {
          id: '3',
          operator_id: OP_A,
          operator_callsign: 'A',
          lat: 0,
          lon: 0,
          accuracy_m: null,
          heading_deg: null,
          speed_mps: null,
          recorded_at: t3,
        },
      ]);
      const page = await service.getPositions(EVENT_ID, {
        operatorId: null,
        fromAt: null,
        toAt: null,
        cursor: null,
        limit: 2,
      });
      expect(page.rows).toHaveLength(2);
      // nextCursor points to the last emitted row (t2), not the dropped one.
      expect(page.nextCursor).toBe(t2.toISOString());
    });
  });

  // ─── export ────────────────────────────────────────────────────────────

  describe('exportEvent', () => {
    it('throws NotFound for unknown event', async () => {
      prisma.event.findUnique.mockResolvedValueOnce(null);
      await expect(service.exportEvent(EVENT_ID, { includeTimeline: true })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('aggregates participants, missions, zones, timeline, count, generatedAt', async () => {
      analytics.getOperatorsByEvent.mockResolvedValueOnce([
        {
          operatorId: OP_A,
          callsign: 'ALPHA',
          missionsAttempted: 2,
          missionsCompleted: 1,
          efficiency: 0.5,
          pointsEarned: 25,
          totalMissionSeconds: 0,
          activeTimeSeconds: 100,
          positionFixes: 42,
          squadId: null,
          squadName: 'Squad A',
          teamId: null,
          teamName: 'Red',
        },
      ]);
      prisma.mission.findMany.mockResolvedValueOnce([
        {
          id: MISSION_ID,
          name: 'CP-1',
          type: 'CHECKPOINT',
          status: 'ACTIVE',
          pointsReward: 25,
          progress: [{ id: 'p1' }],
        },
      ]);
      prisma.zone.findMany.mockResolvedValueOnce([{ id: ZONE_ID, name: 'Alpha Zone' }]);
      prisma.positionHistory.count.mockResolvedValueOnce(42);
      // timeline fetched only if includeTimeline=true: stub it.
      prisma.$queryRaw.mockResolvedValueOnce([]);

      const out = await service.exportEvent(EVENT_ID, { includeTimeline: true });

      expect(out.event.id).toBe(EVENT_ID);
      expect(out.participants).toHaveLength(1);
      expect(out.participants[0]).toMatchObject({
        operatorId: OP_A,
        missionsCompleted: 1,
        positionFixes: 42,
        squadName: 'Squad A',
      });
      expect(out.missions[0]).toMatchObject({ id: MISSION_ID, completions: 1 });
      expect(out.zones).toEqual([{ id: ZONE_ID, name: 'Alpha Zone' }]);
      expect(out.positionsCount).toBe(42);
      expect(out.timeline).toEqual([]); // queryRaw returned []
      expect(typeof out.generatedAt).toBe('string');
    });

    it('skips timeline when includeTimeline=false', async () => {
      analytics.getOperatorsByEvent.mockResolvedValueOnce([]);
      prisma.mission.findMany.mockResolvedValueOnce([]);
      prisma.zone.findMany.mockResolvedValueOnce([]);
      prisma.positionHistory.count.mockResolvedValueOnce(0);
      const out = await service.exportEvent(EVENT_ID, { includeTimeline: false });
      expect(out.timeline).toEqual([]);
      // queryRaw never called when timeline is skipped.
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
  });
});
