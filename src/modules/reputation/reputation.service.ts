import { Injectable, NotFoundException } from '@nestjs/common';
import type { ReputationLog } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import {
  type CreateReputationLogDto,
  type OperatorReputationView,
  REPUTATION_BASELINE,
  type ReputationLogView,
  computeDelta,
} from './dto/reputation.dto';

/**
 * Append-only audit trail of operator penalties/commendations + on-read score
 * computation. The service translates `kind` × `severity` into a numeric
 * `delta` (admin doesn't pick the number) and exposes `score = baseline + Σ`.
 *
 * Anti-cheat (1.17) consumes `recordEntry` directly with `createdById = null`
 * for system-generated logs.
 */
@Injectable()
export class ReputationService {
  constructor(private readonly prisma: PrismaService) {}

  async recordEntry(
    operatorId: string,
    dto: CreateReputationLogDto,
    createdById: string | null,
  ): Promise<ReputationLogView> {
    await this.requireOperator(operatorId);
    if (dto.eventId) {
      await this.requireEvent(dto.eventId);
    }

    const delta = computeDelta(dto.kind, dto.severity);

    const row = await this.prisma.reputationLog.create({
      data: {
        operatorId,
        eventId: dto.eventId ?? null,
        kind: dto.kind,
        severity: dto.severity,
        reason: dto.reason,
        delta,
        note: dto.note ?? null,
        createdById,
      },
    });
    return this.toView(row);
  }

  async getOperatorReputation(operatorId: string): Promise<OperatorReputationView> {
    await this.requireOperator(operatorId);

    const [logs, sum] = await Promise.all([
      this.prisma.reputationLog.findMany({
        where: { operatorId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.reputationLog.aggregate({
        where: { operatorId },
        _sum: { delta: true },
      }),
    ]);

    const score = REPUTATION_BASELINE + (sum._sum.delta ?? 0);
    return {
      operatorId,
      score,
      history: logs.map((l) => this.toView(l)),
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async requireOperator(id: string): Promise<void> {
    const op = await this.prisma.operator.findUnique({ where: { id } });
    if (!op) {
      throw new NotFoundException('Operator not found.');
    }
  }

  private async requireEvent(id: string): Promise<void> {
    const ev = await this.prisma.event.findUnique({ where: { id } });
    if (!ev) {
      throw new NotFoundException('Event not found.');
    }
  }

  private toView(l: ReputationLog): ReputationLogView {
    return {
      id: l.id,
      operatorId: l.operatorId,
      eventId: l.eventId,
      kind: l.kind,
      severity: l.severity,
      reason: l.reason,
      delta: l.delta,
      note: l.note,
      createdById: l.createdById,
      createdAt: l.createdAt.toISOString(),
    };
  }
}
