import { z } from 'zod';

export const eventIdParamSchema = z.object({ eventId: z.string().uuid() });

/**
 * Per-operator performance snapshot, scoped to one event.
 *
 * `efficiency` is `missionsCompleted / max(missionsAttempted, 1)` clamped to
 * 0 when the operator never started a mission — avoids the NaN that division
 * by zero would otherwise produce and keeps consumers honest about the
 * "engaged with 0 missions" case.
 *
 * `totalMissionSeconds` sums `progress.secondsAccumulated` over the
 * cumulative-time mission types (CAPTURE / HOLD / DEFEND). CHECKPOINT/TIME
 * complete instantaneously and contribute 0 — that's a feature, not a bug:
 * the metric measures time-on-ground in contested zones.
 *
 * `activeTimeSeconds` is `EXTRACT EPOCH FROM (MAX(recordedAt) - MIN(recordedAt))`
 * in position_history for the event. An operator with a single fix gets 0;
 * with zero fixes also gets 0. Square-bracketed by the event's lifetime since
 * positions are gated by event ACTIVE upstream (1.9).
 *
 * `squadId / squadName / teamId / teamName` are nullable for the corner case
 * where the operator scored mission progress but is no longer in any squad
 * of the event — mirrors the ranking row shape (1.15).
 */
export interface OperatorAnalyticsRow {
  operatorId: string;
  callsign: string;
  missionsAttempted: number;
  missionsCompleted: number;
  efficiency: number;
  pointsEarned: number;
  totalMissionSeconds: number;
  activeTimeSeconds: number;
  positionFixes: number;
  squadId: string | null;
  squadName: string | null;
  teamId: string | null;
  teamName: string | null;
}

/**
 * Per-squad performance snapshot. Members-level metrics are summed, then
 * `efficiency` is recomputed from the totals (NOT averaged from member
 * efficiencies — a squad of 10 with 9 idle + 1 perfect should not score 100%
 * efficient).
 */
export interface SquadAnalyticsRow {
  squadId: string;
  squadName: string;
  teamId: string;
  teamName: string;
  memberCount: number;
  missionsAttempted: number;
  missionsCompleted: number;
  efficiency: number;
  pointsEarned: number;
  totalMissionSeconds: number;
  positionFixes: number;
}
