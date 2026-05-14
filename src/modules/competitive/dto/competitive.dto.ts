import { RoundStatus } from '@prisma/client';
import { z } from 'zod';

export { RoundStatus };

// ─── ID params ─────────────────────────────────────────────────────────────

export const eventIdParamSchema = z.object({ eventId: z.string().uuid() });
export const roundIdParamSchema = z.object({ id: z.string().uuid() });
export const eliminationIdParamSchema = z.object({ id: z.string().uuid() });

// ─── Rounds ────────────────────────────────────────────────────────────────

export const createRoundSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

/**
 * Round update is the lifecycle transition mechanism. Two intended uses:
 *   1. End the round: status=COMPLETED, optional winningTeamId (null = tie),
 *      optional note.
 *   2. Cancel the round: status=CANCELLED, optional note. winningTeamId is
 *      forced null by the service.
 */
export const updateRoundSchema = z
  .object({
    status: z.enum([RoundStatus.COMPLETED, RoundStatus.CANCELLED]).optional(),
    winningTeamId: z.string().uuid().nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required.' });

export type CreateRoundDto = z.infer<typeof createRoundSchema>;
export type UpdateRoundDto = z.infer<typeof updateRoundSchema>;

export interface RoundView {
  id: string;
  eventId: string;
  roundNumber: number;
  status: RoundStatus;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  winningTeamId: string | null;
  winningTeamName: string | null;
  eliminationCount: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Eliminations ──────────────────────────────────────────────────────────

export const createEliminationSchema = z.object({
  eliminatedOperatorId: z.string().uuid(),
  eliminatedById: z.string().uuid().optional(),
  note: z.string().trim().max(500).optional(),
});

export type CreateEliminationDto = z.infer<typeof createEliminationSchema>;

export interface EliminationView {
  id: string;
  roundId: string;
  eliminatedOperatorId: string;
  eliminatedCallsign: string;
  eliminatedById: string | null;
  killerCallsign: string | null;
  eliminatedAt: string;
  note: string | null;
}

// ─── Scoreboard ────────────────────────────────────────────────────────────

/**
 * Per-team aggregation: round wins (winning_team_id matches), squads/operators
 * counts via squad_members. Ties (rounds where winningTeamId is NULL) do not
 * count for any team — separate `tiedRounds` metric on the top-level view.
 */
export interface TeamScoreboardRow {
  teamId: string;
  teamName: string;
  color: string;
  roundsWon: number;
  totalKills: number;
  totalDeaths: number;
  operatorCount: number;
}

export interface OperatorScoreboardRow {
  operatorId: string;
  callsign: string;
  teamId: string | null;
  teamName: string | null;
  kills: number;
  deaths: number;
  /** kills / max(deaths, 1) — clamped to 0 when no kills AND no deaths. */
  kd: number;
  roundsPlayed: number;
  roundsSurvived: number;
}

export interface ScoreboardView {
  eventId: string;
  roundsPlayed: number;
  roundsCompleted: number;
  tiedRounds: number;
  teams: TeamScoreboardRow[];
  operators: OperatorScoreboardRow[];
}

// ─── MVP ───────────────────────────────────────────────────────────────────

export interface RoundMvpRow {
  roundId: string;
  roundNumber: number;
  operatorId: string;
  callsign: string;
  kills: number;
  /** Did the MVP survive the round? Drives tie-break — survivors win. */
  survived: boolean;
}

export interface MatchMvpRow {
  operatorId: string;
  callsign: string;
  teamId: string | null;
  teamName: string | null;
  totalKills: number;
  totalDeaths: number;
  kd: number;
}

export interface MvpView {
  eventId: string;
  matchMvp: MatchMvpRow | null;
  roundMvps: RoundMvpRow[];
}
