import { ReputationKind, ReputationReason, ReputationSeverity } from '@prisma/client';
import { z } from 'zod';

export { ReputationKind, ReputationReason, ReputationSeverity };

const NOTE_MAX = 1000;

/**
 * Score baseline. Score = REPUTATION_BASELINE + Σ(delta). New operators with no
 * logs sit at REPUTATION_BASELINE.
 */
export const REPUTATION_BASELINE = 100;

/**
 * Severity → magnitude mapping. Sign comes from `kind` (PENALTY = negative,
 * COMMENDATION = positive). Admin doesn't pick the number — picks intent
 * (kind+severity) and the service translates. Keeps abuse in check (no
 * "-1000 in anger" entries) and keeps the scale legible across admins.
 */
export const REPUTATION_DELTA_BY_SEVERITY: Record<ReputationSeverity, number> = {
  [ReputationSeverity.MINOR]: 5,
  [ReputationSeverity.MAJOR]: 15,
  [ReputationSeverity.SEVERE]: 50,
};

export function computeDelta(kind: ReputationKind, severity: ReputationSeverity): number {
  const magnitude = REPUTATION_DELTA_BY_SEVERITY[severity];
  return kind === ReputationKind.PENALTY ? -magnitude : magnitude;
}

export const operatorIdParamSchema = z.object({ operatorId: z.string().uuid() });

export const createReputationLogSchema = z.object({
  kind: z.nativeEnum(ReputationKind),
  severity: z.nativeEnum(ReputationSeverity),
  reason: z.nativeEnum(ReputationReason),
  eventId: z.string().uuid().optional(),
  note: z.string().trim().max(NOTE_MAX).optional(),
});

export type CreateReputationLogDto = z.infer<typeof createReputationLogSchema>;

export interface ReputationLogView {
  id: string;
  operatorId: string;
  eventId: string | null;
  kind: ReputationKind;
  severity: ReputationSeverity;
  reason: ReputationReason;
  delta: number;
  note: string | null;
  createdById: string | null;
  createdAt: string;
}

export interface OperatorReputationView {
  operatorId: string;
  score: number;
  history: ReputationLogView[];
}
