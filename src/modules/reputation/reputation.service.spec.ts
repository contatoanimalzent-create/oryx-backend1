import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ReputationKind, ReputationReason, ReputationSeverity } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../../shared/database/prisma.service';
import { REPUTATION_BASELINE, computeDelta } from './dto/reputation.dto';
import { ReputationService } from './reputation.service';

const OP_ID = '11111111-1111-1111-1111-111111111111';
const EVENT_ID = '22222222-2222-2222-2222-222222222222';
const ADMIN_ID = '33333333-3333-3333-3333-333333333333';
const LOG_ID = '44444444-4444-4444-4444-444444444444';

describe('ReputationService', () => {
  let service: ReputationService;
  let prisma: {
    operator: { findUnique: ReturnType<typeof vi.fn> };
    event: { findUnique: ReturnType<typeof vi.fn> };
    reputationLog: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      aggregate: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(async () => {
    prisma = {
      operator: { findUnique: vi.fn().mockResolvedValue({ id: OP_ID }) },
      event: { findUnique: vi.fn().mockResolvedValue({ id: EVENT_ID }) },
      reputationLog: {
        create: vi.fn(),
        findMany: vi.fn(),
        aggregate: vi.fn(),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [ReputationService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(ReputationService);
  });

  afterEach(() => vi.restoreAllMocks());

  // ─── computeDelta helper ─────────────────────────────────────────────────

  describe('computeDelta', () => {
    it('PENALTY MINOR/MAJOR/SEVERE → -5/-15/-50', () => {
      expect(computeDelta(ReputationKind.PENALTY, ReputationSeverity.MINOR)).toBe(-5);
      expect(computeDelta(ReputationKind.PENALTY, ReputationSeverity.MAJOR)).toBe(-15);
      expect(computeDelta(ReputationKind.PENALTY, ReputationSeverity.SEVERE)).toBe(-50);
    });

    it('COMMENDATION mirrors with positive sign', () => {
      expect(computeDelta(ReputationKind.COMMENDATION, ReputationSeverity.MINOR)).toBe(5);
      expect(computeDelta(ReputationKind.COMMENDATION, ReputationSeverity.MAJOR)).toBe(15);
      expect(computeDelta(ReputationKind.COMMENDATION, ReputationSeverity.SEVERE)).toBe(50);
    });
  });

  // ─── recordEntry ─────────────────────────────────────────────────────────

  describe('recordEntry', () => {
    it('persists with derived delta and createdById', async () => {
      prisma.reputationLog.create.mockResolvedValue({
        id: LOG_ID,
        operatorId: OP_ID,
        eventId: EVENT_ID,
        kind: ReputationKind.PENALTY,
        severity: ReputationSeverity.MAJOR,
        reason: ReputationReason.AFK,
        delta: -15,
        note: 'left mid-match',
        createdById: ADMIN_ID,
        createdAt: new Date('2026-05-04T10:00:00Z'),
      });

      const view = await service.recordEntry(
        OP_ID,
        {
          kind: ReputationKind.PENALTY,
          severity: ReputationSeverity.MAJOR,
          reason: ReputationReason.AFK,
          eventId: EVENT_ID,
          note: 'left mid-match',
        },
        ADMIN_ID,
      );

      expect(prisma.reputationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          operatorId: OP_ID,
          eventId: EVENT_ID,
          kind: ReputationKind.PENALTY,
          severity: ReputationSeverity.MAJOR,
          reason: ReputationReason.AFK,
          delta: -15,
          note: 'left mid-match',
          createdById: ADMIN_ID,
        }),
      });
      expect(view.delta).toBe(-15);
      expect(view.createdById).toBe(ADMIN_ID);
    });

    it('accepts createdById = null for system-generated entries', async () => {
      prisma.reputationLog.create.mockResolvedValue({
        id: LOG_ID,
        operatorId: OP_ID,
        eventId: null,
        kind: ReputationKind.PENALTY,
        severity: ReputationSeverity.SEVERE,
        reason: ReputationReason.CHEATING,
        delta: -50,
        note: null,
        createdById: null,
        createdAt: new Date(),
      });

      const view = await service.recordEntry(
        OP_ID,
        {
          kind: ReputationKind.PENALTY,
          severity: ReputationSeverity.SEVERE,
          reason: ReputationReason.CHEATING,
        },
        null,
      );

      expect(view.createdById).toBeNull();
      expect(view.delta).toBe(-50);
    });

    it('throws when operator does not exist', async () => {
      prisma.operator.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.recordEntry(
          OP_ID,
          {
            kind: ReputationKind.PENALTY,
            severity: ReputationSeverity.MINOR,
            reason: ReputationReason.OTHER,
          },
          ADMIN_ID,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.reputationLog.create).not.toHaveBeenCalled();
    });

    it('throws when eventId is provided but event does not exist', async () => {
      prisma.event.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.recordEntry(
          OP_ID,
          {
            kind: ReputationKind.PENALTY,
            severity: ReputationSeverity.MINOR,
            reason: ReputationReason.OTHER,
            eventId: EVENT_ID,
          },
          ADMIN_ID,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.reputationLog.create).not.toHaveBeenCalled();
    });
  });

  // ─── getOperatorReputation ───────────────────────────────────────────────

  describe('getOperatorReputation', () => {
    it('returns baseline when no logs exist', async () => {
      prisma.reputationLog.findMany.mockResolvedValueOnce([]);
      prisma.reputationLog.aggregate.mockResolvedValueOnce({ _sum: { delta: null } });
      const out = await service.getOperatorReputation(OP_ID);
      expect(out.score).toBe(REPUTATION_BASELINE);
      expect(out.history).toEqual([]);
    });

    it('returns baseline + sum and history sorted DESC', async () => {
      const logs = [
        {
          id: 'l-2',
          operatorId: OP_ID,
          eventId: null,
          kind: ReputationKind.COMMENDATION,
          severity: ReputationSeverity.MAJOR,
          reason: ReputationReason.TEAMWORK,
          delta: 15,
          note: 'helped squad',
          createdById: ADMIN_ID,
          createdAt: new Date('2026-05-04T12:00:00Z'),
        },
        {
          id: 'l-1',
          operatorId: OP_ID,
          eventId: EVENT_ID,
          kind: ReputationKind.PENALTY,
          severity: ReputationSeverity.MAJOR,
          reason: ReputationReason.AFK,
          delta: -15,
          note: null,
          createdById: ADMIN_ID,
          createdAt: new Date('2026-05-04T10:00:00Z'),
        },
      ];
      prisma.reputationLog.findMany.mockResolvedValueOnce(logs);
      prisma.reputationLog.aggregate.mockResolvedValueOnce({ _sum: { delta: 0 } });
      const out = await service.getOperatorReputation(OP_ID);
      expect(out.score).toBe(REPUTATION_BASELINE);
      expect(out.history).toHaveLength(2);
      expect(out.history[0].id).toBe('l-2');
      expect(out.history[1].id).toBe('l-1');
      expect(prisma.reputationLog.findMany).toHaveBeenCalledWith({
        where: { operatorId: OP_ID },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('throws when operator does not exist', async () => {
      prisma.operator.findUnique.mockResolvedValueOnce(null);
      await expect(service.getOperatorReputation(OP_ID)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.reputationLog.findMany).not.toHaveBeenCalled();
    });
  });
});
