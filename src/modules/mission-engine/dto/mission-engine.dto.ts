import type { MissionProgressState, MissionType } from '@prisma/client';

export const MISSION_PROGRESS_QUEUE_NAME = 'mission-progress';

/**
 * Channel notifications module (1.14) and ranking (1.15) subscribe to.
 * Payload mirrors the row that was just upserted.
 */
export const MISSION_PROGRESS_CHANNEL = 'mission:progress:updated';

/**
 * Job pushed by PositionsProcessor at the end of every successful position
 * write. The engine recomputes progress for the operator across every active
 * mission of the event.
 */
export interface MissionProgressJob {
  eventId: string;
  operatorId: string;
  lat: number;
  lon: number;
  /** Server-authoritative timestamp (already clamped if drift > 5min). */
  recordedAt: string;
}

/**
 * Per-type progress state stored under MissionProgress.progress (JSONB).
 * Only the variants the engine writes today; SQUAD / FACTION are deferred.
 */
export interface CaptureLikeProgress {
  /** Cumulative seconds the operator has been inside the zone. */
  secondsAccumulated: number;
  /** Last recorded-at timestamp where the operator was inside, or null. */
  lastInsideAt: string | null;
}

export type CheckpointProgress = Record<string, never>;

/** Output snapshot publicado em mission:progress:updated. */
export interface MissionProgressUpdate {
  missionId: string;
  operatorId: string;
  type: MissionType;
  state: MissionProgressState;
  progress: unknown;
  completedAt: string | null;
}
