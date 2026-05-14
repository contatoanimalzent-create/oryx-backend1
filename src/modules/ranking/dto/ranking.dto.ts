import { z } from 'zod';

export const eventIdParamSchema = z.object({ eventId: z.string().uuid() });

export const RANKING_LIMIT_DEFAULT = 50;
const LIMIT_MAX = 200;

/**
 * `?limit=N` is the only query knob. `coerce` so it survives the string form
 * Express hands us; cap mirrors what aggregations can comfortably return
 * without touching the entire mission_progress table.
 *
 * Default is applied at the controller boundary (`limit ?? RANKING_LIMIT_DEFAULT`)
 * rather than via `.default()` — the project's `parse<T>` helper binds T to
 * both input and output, and `.default()` makes them differ. Same pattern used
 * by the missions module (which dropped defaults entirely for this reason).
 */
export const rankingQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(LIMIT_MAX).optional(),
});

export type RankingQueryInput = z.infer<typeof rankingQuerySchema>;
export interface RankingQuery {
  limit: number;
}

/**
 * Per-operator ranking row. squad/team fields are nullable for the corner
 * case where the operator scored points but is no longer in any squad of
 * the event (squad disbanded mid-event, member kicked, etc.). Engine still
 * counts the completion — the score is the operator's, not the squad's.
 */
export interface OperatorRankingRow {
  operatorId: string;
  callsign: string;
  points: number;
  missionsCompleted: number;
  squadId: string | null;
  squadName: string | null;
  teamId: string | null;
  teamName: string | null;
}

export interface SquadRankingRow {
  squadId: string;
  squadName: string;
  teamId: string;
  teamName: string;
  points: number;
  missionsCompleted: number;
  memberCount: number;
}

export interface TeamRankingRow {
  teamId: string;
  teamName: string;
  color: string;
  points: number;
  missionsCompleted: number;
  operatorCount: number;
}
