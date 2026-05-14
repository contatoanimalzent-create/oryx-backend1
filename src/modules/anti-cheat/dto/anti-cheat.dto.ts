import { CheatDetector, CheatSeverity } from '@prisma/client';

export { CheatDetector, CheatSeverity };

export const ANTI_CHEAT_QUEUE_NAME = 'anti-cheat-inspect';

/**
 * Job pushed by PositionsProcessor after each accepted position. Mirrors the
 * mission-engine tick (sessão 1.13) but also forwards `clientSpeedMps` and
 * `accuracyM` so the GPS-inconsistency detector can compare client-reported
 * speed against the haversine-derived value.
 */
export interface AntiCheatInspectJob {
  eventId: string;
  operatorId: string;
  lat: number;
  lon: number;
  /** Server-authoritative timestamp (already clamped if drift > 5min). */
  recordedAt: string;
  /** Client-reported instantaneous speed; useful for GPS coherence checks. */
  clientSpeedMps?: number;
  /** GPS accuracy in meters; high values feed GPS_INCONSISTENCY. */
  accuracyM?: number;
}

// ─── Detector thresholds (conservadores — CLAUDE.md §3.6) ───────────────────
//
// Tuned to flag obvious cheating without punishing legitimate hardware noise.
// SNIPER mode (operator stationary for hours with degrading fix) and
// CHALLENGER (fast vehicle dashes between zones) both fit inside these bounds.
// Move to per-event configuration only after observability shows real false
// positives.

/** Calculated speed below this is always quiet. */
export const SPEED_MINOR_MPS = 60; // 216 km/h
export const SPEED_MAJOR_MPS = 120; // 432 km/h
export const SPEED_SEVERE_MPS = 250; // 900 km/h

/** Brutal teleport: large displacement in a tiny window, regardless of speed. */
export const JUMP_DELTA_M = 500;
export const JUMP_DT_MAX_S = 5;

/** GPS-quality heuristics. */
export const GPS_BAD_ACCURACY_M = 100;
export const GPS_CONSECUTIVE_BAD = 3;
export const GPS_SPEED_DIVERGENCE_MPS = 50;

// ─── Evidence shapes — frozen at write time ─────────────────────────────────

export interface SpeedImpossibleEvidence {
  detector: 'SPEED_IMPOSSIBLE';
  deltaM: number;
  dtSeconds: number;
  calcSpeedMps: number;
  thresholdMps: number;
  previousFixId: string;
}

export interface LocationJumpEvidence {
  detector: 'LOCATION_JUMP';
  deltaM: number;
  dtSeconds: number;
  previousFixId: string;
}

export interface GpsInconsistencyEvidence {
  detector: 'GPS_INCONSISTENCY';
  reason: 'consecutive_bad_accuracy' | 'speed_divergence';
  accuracySamples?: Array<number | null>;
  clientSpeedMps?: number;
  calcSpeedMps?: number;
  divergenceMps?: number;
  previousFixId?: string;
}

export type CheatEvidence =
  | SpeedImpossibleEvidence
  | LocationJumpEvidence
  | GpsInconsistencyEvidence;

export interface DetectorHit {
  detector: CheatDetector;
  severity: CheatSeverity;
  evidence: CheatEvidence;
}
