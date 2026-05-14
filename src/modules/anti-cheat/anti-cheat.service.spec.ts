import { Test } from '@nestjs/testing';
import {
  CheatDetector,
  CheatSeverity,
  ReputationKind,
  ReputationReason,
  ReputationSeverity,
} from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../../shared/database/prisma.service';
import { ReputationService } from '../reputation/reputation.service';
import { AntiCheatService, haversineMeters } from './anti-cheat.service';
import type { AntiCheatInspectJob } from './dto/anti-cheat.dto';

const OPERATOR_ID = '11111111-1111-1111-1111-111111111111';
const EVENT_ID = '22222222-2222-2222-2222-222222222222';
const PREV_FIX_ID = '33333333-3333-3333-3333-333333333333';
const PREV_FIX_2_ID = '44444444-4444-4444-4444-444444444444';

function fix(overrides: Record<string, unknown>) {
  return {
    id: PREV_FIX_ID,
    operatorId: OPERATOR_ID,
    eventId: EVENT_ID,
    lat: -23.55,
    lon: -46.62,
    accuracyM: 5,
    headingDeg: null,
    speedMps: null,
    clientEventId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    recordedAt: new Date('2026-05-12T20:00:00.000Z'),
    receivedAt: new Date('2026-05-12T20:00:01.000Z'),
    ...overrides,
  };
}

function job(overrides: Partial<AntiCheatInspectJob> = {}): AntiCheatInspectJob {
  return {
    eventId: EVENT_ID,
    operatorId: OPERATOR_ID,
    lat: -23.55,
    lon: -46.62,
    recordedAt: '2026-05-12T20:00:10.000Z',
    ...overrides,
  };
}

describe('AntiCheatService', () => {
  let service: AntiCheatService;
  let prisma: {
    positionHistory: { findMany: ReturnType<typeof vi.fn> };
    cheatSuspicion: { create: ReturnType<typeof vi.fn> };
  };
  let reputation: { recordEntry: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = {
      positionHistory: { findMany: vi.fn().mockResolvedValue([]) },
      cheatSuspicion: { create: vi.fn().mockResolvedValue({}) },
    };
    reputation = { recordEntry: vi.fn().mockResolvedValue({}) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AntiCheatService,
        { provide: PrismaService, useValue: prisma },
        { provide: ReputationService, useValue: reputation },
      ],
    }).compile();
    service = moduleRef.get(AntiCheatService);
  });

  afterEach(() => vi.restoreAllMocks());

  // ─── haversine helper ────────────────────────────────────────────────────

  describe('haversineMeters', () => {
    it('is zero for the same point', () => {
      expect(haversineMeters(-23.55, -46.62, -23.55, -46.62)).toBe(0);
    });

    it('matches ~111km per degree of latitude (great-circle math)', () => {
      const m = haversineMeters(0, 0, 1, 0);
      expect(m).toBeGreaterThan(110_000);
      expect(m).toBeLessThan(112_000);
    });
  });

  // ─── No-previous-fix path ────────────────────────────────────────────────

  it('skips speed/jump when there is no previous fix', async () => {
    prisma.positionHistory.findMany.mockResolvedValue([]);
    const hits = await service.inspectPosition(job());
    expect(hits).toEqual([]);
    expect(prisma.cheatSuspicion.create).not.toHaveBeenCalled();
    expect(reputation.recordEntry).not.toHaveBeenCalled();
  });

  // ─── SPEED_IMPOSSIBLE ────────────────────────────────────────────────────

  describe('SPEED_IMPOSSIBLE', () => {
    it('does not fire below the MINOR threshold (60 m/s)', async () => {
      // ~0.0005° lat ≈ 55m; over 10s → 5.5 m/s (jogger pace).
      prisma.positionHistory.findMany.mockResolvedValue([fix({ lat: -23.55, lon: -46.62 })]);
      const hits = await service.inspectPosition(
        job({ lat: -23.5495, lon: -46.62, recordedAt: '2026-05-12T20:00:10.000Z' }),
      );
      expect(hits).toEqual([]);
    });

    it('fires MINOR between 60-120 m/s', async () => {
      // ~0.01° lat ≈ 1.11km; 10s → 111 m/s.
      prisma.positionHistory.findMany.mockResolvedValue([fix({ lat: -23.55, lon: -46.62 })]);
      const hits = await service.inspectPosition(job({ lat: -23.55 + 0.0072, lon: -46.62 }));
      const speedHit = hits.find((h) => h.detector === CheatDetector.SPEED_IMPOSSIBLE);
      expect(speedHit?.severity).toBe(CheatSeverity.MINOR);
    });

    it('fires MAJOR between 120-250 m/s', async () => {
      // ~0.02° lat ≈ 2.22km; 10s → 222 m/s.
      prisma.positionHistory.findMany.mockResolvedValue([fix({ lat: -23.55, lon: -46.62 })]);
      const hits = await service.inspectPosition(job({ lat: -23.55 + 0.02, lon: -46.62 }));
      const speedHit = hits.find((h) => h.detector === CheatDetector.SPEED_IMPOSSIBLE);
      expect(speedHit?.severity).toBe(CheatSeverity.MAJOR);
    });

    it('fires SEVERE above 250 m/s', async () => {
      // ~0.05° lat ≈ 5.55km; 10s → 555 m/s.
      prisma.positionHistory.findMany.mockResolvedValue([fix({ lat: -23.55, lon: -46.62 })]);
      const hits = await service.inspectPosition(job({ lat: -23.55 + 0.05, lon: -46.62 }));
      const speedHit = hits.find((h) => h.detector === CheatDetector.SPEED_IMPOSSIBLE);
      expect(speedHit?.severity).toBe(CheatSeverity.SEVERE);
    });

    it('ignores zero or negative dt (clock anomaly)', async () => {
      prisma.positionHistory.findMany.mockResolvedValue([
        fix({ recordedAt: new Date('2026-05-12T20:00:10.000Z') }),
      ]);
      const hits = await service.inspectPosition(
        job({ lat: -23.5, lon: -46.62, recordedAt: '2026-05-12T20:00:10.000Z' }),
      );
      const speedHit = hits.find((h) => h.detector === CheatDetector.SPEED_IMPOSSIBLE);
      expect(speedHit).toBeUndefined();
    });
  });

  // ─── LOCATION_JUMP ───────────────────────────────────────────────────────

  describe('LOCATION_JUMP', () => {
    it('fires MAJOR when delta > 500m and dt < 5s', async () => {
      // 0.01° lat ≈ 1.11km in 2s.
      prisma.positionHistory.findMany.mockResolvedValue([
        fix({
          lat: -23.55,
          lon: -46.62,
          recordedAt: new Date('2026-05-12T20:00:08.000Z'),
        }),
      ]);
      const hits = await service.inspectPosition(
        job({
          lat: -23.55 + 0.01,
          lon: -46.62,
          recordedAt: '2026-05-12T20:00:10.000Z',
        }),
      );
      const jumpHit = hits.find((h) => h.detector === CheatDetector.LOCATION_JUMP);
      expect(jumpHit?.severity).toBe(CheatSeverity.MAJOR);
    });

    it('does not fire when dt >= 5s (no longer a jump)', async () => {
      prisma.positionHistory.findMany.mockResolvedValue([
        fix({
          lat: -23.55,
          lon: -46.62,
          recordedAt: new Date('2026-05-12T20:00:00.000Z'),
        }),
      ]);
      const hits = await service.inspectPosition(
        job({
          lat: -23.55 + 0.01,
          lon: -46.62,
          recordedAt: '2026-05-12T20:00:10.000Z',
        }),
      );
      const jumpHit = hits.find((h) => h.detector === CheatDetector.LOCATION_JUMP);
      expect(jumpHit).toBeUndefined();
    });

    it('does not fire when delta <= 500m', async () => {
      // 0.001° lat ≈ 111m in 2s — fast, not a jump.
      prisma.positionHistory.findMany.mockResolvedValue([
        fix({
          lat: -23.55,
          lon: -46.62,
          recordedAt: new Date('2026-05-12T20:00:08.000Z'),
        }),
      ]);
      const hits = await service.inspectPosition(
        job({
          lat: -23.55 + 0.001,
          lon: -46.62,
          recordedAt: '2026-05-12T20:00:10.000Z',
        }),
      );
      const jumpHit = hits.find((h) => h.detector === CheatDetector.LOCATION_JUMP);
      expect(jumpHit).toBeUndefined();
    });
  });

  // ─── GPS_INCONSISTENCY ───────────────────────────────────────────────────

  describe('GPS_INCONSISTENCY', () => {
    it('fires MINOR when 3 consecutive fixes have accuracyM > 100m', async () => {
      prisma.positionHistory.findMany.mockResolvedValue([
        fix({ id: PREV_FIX_ID, accuracyM: 150 }),
        fix({ id: PREV_FIX_2_ID, accuracyM: 200 }),
      ]);
      const hits = await service.inspectPosition(job({ accuracyM: 180 }));
      const gpsHit = hits.find((h) => h.detector === CheatDetector.GPS_INCONSISTENCY);
      expect(gpsHit?.severity).toBe(CheatSeverity.MINOR);
      expect(gpsHit?.evidence).toMatchObject({ reason: 'consecutive_bad_accuracy' });
    });

    it('does not fire when one of the recent fixes had good accuracy', async () => {
      prisma.positionHistory.findMany.mockResolvedValue([
        fix({ accuracyM: 80 }), // good
        fix({ id: PREV_FIX_2_ID, accuracyM: 200 }),
      ]);
      const hits = await service.inspectPosition(job({ accuracyM: 180 }));
      const gpsHit = hits.find((h) => h.detector === CheatDetector.GPS_INCONSISTENCY);
      expect(gpsHit).toBeUndefined();
    });

    it('fires MINOR when client-reported speed diverges from calc by > 50 m/s', async () => {
      prisma.positionHistory.findMany.mockResolvedValue([fix({ lat: -23.55, lon: -46.62 })]);
      // ~0 movement in 10s → calcSpeed ≈ 0. Client claims 80 m/s.
      const hits = await service.inspectPosition(
        job({
          lat: -23.55,
          lon: -46.62,
          recordedAt: '2026-05-12T20:00:10.000Z',
          clientSpeedMps: 80,
        }),
      );
      const gpsHit = hits.find((h) => h.detector === CheatDetector.GPS_INCONSISTENCY);
      expect(gpsHit?.severity).toBe(CheatSeverity.MINOR);
      expect(gpsHit?.evidence).toMatchObject({ reason: 'speed_divergence' });
    });

    it('does not fire when client speed roughly matches calc', async () => {
      prisma.positionHistory.findMany.mockResolvedValue([fix({ lat: -23.55, lon: -46.62 })]);
      const hits = await service.inspectPosition(
        job({
          lat: -23.55,
          lon: -46.62,
          recordedAt: '2026-05-12T20:00:10.000Z',
          clientSpeedMps: 1,
        }),
      );
      const gpsHit = hits.find((h) => h.detector === CheatDetector.GPS_INCONSISTENCY);
      expect(gpsHit).toBeUndefined();
    });
  });

  // ─── Persistence + reputation hook ───────────────────────────────────────

  describe('persistence + reputation hook', () => {
    it('writes a CheatSuspicion row for every hit and skips reputation when only MINOR', async () => {
      // Trigger SPEED_IMPOSSIBLE MINOR only.
      prisma.positionHistory.findMany.mockResolvedValue([fix({ lat: -23.55, lon: -46.62 })]);
      await service.inspectPosition(job({ lat: -23.55 + 0.0072, lon: -46.62 }));
      expect(prisma.cheatSuspicion.create).toHaveBeenCalledOnce();
      expect(reputation.recordEntry).not.toHaveBeenCalled();
    });

    it('triggers reputation PENALTY MAJOR when severity escalates', async () => {
      prisma.positionHistory.findMany.mockResolvedValue([fix({ lat: -23.55, lon: -46.62 })]);
      // ~0.02° lat in 10s → ~222 m/s → MAJOR.
      await service.inspectPosition(job({ lat: -23.55 + 0.02, lon: -46.62 }));

      expect(prisma.cheatSuspicion.create).toHaveBeenCalled();
      expect(reputation.recordEntry).toHaveBeenCalledWith(
        OPERATOR_ID,
        expect.objectContaining({
          kind: ReputationKind.PENALTY,
          severity: ReputationSeverity.MAJOR,
          reason: ReputationReason.CHEATING,
          eventId: EVENT_ID,
        }),
        null,
      );
    });

    it('triggers reputation PENALTY SEVERE on extreme speed', async () => {
      prisma.positionHistory.findMany.mockResolvedValue([fix({ lat: -23.55, lon: -46.62 })]);
      await service.inspectPosition(job({ lat: -23.55 + 0.05, lon: -46.62 }));
      expect(reputation.recordEntry).toHaveBeenCalledWith(
        OPERATOR_ID,
        expect.objectContaining({ severity: ReputationSeverity.SEVERE }),
        null,
      );
    });

    it('does not abort the suspicion write if reputation throws', async () => {
      prisma.positionHistory.findMany.mockResolvedValue([fix({ lat: -23.55, lon: -46.62 })]);
      reputation.recordEntry.mockRejectedValueOnce(new Error('rep down'));
      await expect(
        service.inspectPosition(job({ lat: -23.55 + 0.02, lon: -46.62 })),
      ).resolves.toBeDefined();
      expect(prisma.cheatSuspicion.create).toHaveBeenCalled();
    });
  });
});
