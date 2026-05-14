import { z } from 'zod';

export const eventIdParamSchema = z.object({ eventId: z.string().uuid() });

// ─── Limits ─────────────────────────────────────────────────────────────

export const TIMELINE_LIMIT_DEFAULT = 200;
export const TIMELINE_LIMIT_MAX = 1_000;

export const POSITIONS_LIMIT_DEFAULT = 500;
export const POSITIONS_LIMIT_MAX = 5_000;

// ─── Query schemas (Zod) ────────────────────────────────────────────────

/**
 * Default is applied at the controller boundary (`?? TIMELINE_LIMIT_DEFAULT`)
 * rather than via `.default()` — keeps the parser's input and output types
 * symmetric. Same trick used by missions/ranking modules.
 */
export const timelineQuerySchema = z.object({
  fromAt: z.string().datetime().optional(),
  toAt: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(TIMELINE_LIMIT_MAX).optional(),
});
export type TimelineQueryInput = z.infer<typeof timelineQuerySchema>;
export interface TimelineQuery {
  fromAt: string | null;
  toAt: string | null;
  limit: number;
}

export const positionsQuerySchema = z.object({
  operatorId: z.string().uuid().optional(),
  fromAt: z.string().datetime().optional(),
  toAt: z.string().datetime().optional(),
  /** Cursor = `recordedAt` of the last row of the previous page (ISO 8601). */
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(POSITIONS_LIMIT_MAX).optional(),
});
export type PositionsQueryInput = z.infer<typeof positionsQuerySchema>;
export interface PositionsQuery {
  operatorId: string | null;
  fromAt: string | null;
  toAt: string | null;
  cursor: string | null;
  limit: number;
}

export const exportQuerySchema = z.object({
  includeTimeline: z.union([z.literal('true'), z.literal('false'), z.boolean()]).optional(),
});
export type ExportQueryInput = z.infer<typeof exportQuerySchema>;
export interface ExportQuery {
  includeTimeline: boolean;
}

// ─── Views ──────────────────────────────────────────────────────────────

export type TimelineEntryKind = 'MISSION_COMPLETED' | 'CHEAT_SUSPICION' | 'REPUTATION_ENTRY';

/**
 * Single entry on the AAR timeline, normalized across the three sources so a
 * client can render them in one chronological feed. `at` is the canonical
 * timestamp used for ordering and filtering; `operatorId` + `operatorCallsign`
 * identify the subject. `payload` carries detector/severity/reason etc — kept
 * structured (not opaque JSONB) so the admin UI can render typed widgets.
 */
export interface TimelineEntry {
  kind: TimelineEntryKind;
  at: string;
  operatorId: string;
  operatorCallsign: string;
  payload: TimelineMissionCompleted | TimelineCheatSuspicion | TimelineReputationEntry;
}

export interface TimelineMissionCompleted {
  missionId: string;
  missionName: string;
  missionType: string;
  pointsReward: number;
}

export interface TimelineCheatSuspicion {
  suspicionId: string;
  detector: string;
  severity: string;
}

export interface TimelineReputationEntry {
  logId: string;
  kind: string;
  severity: string;
  reason: string;
  delta: number;
  systemGenerated: boolean;
}

export interface PositionView {
  id: string;
  operatorId: string;
  operatorCallsign: string;
  lat: number;
  lon: number;
  accuracyM: number | null;
  headingDeg: number | null;
  speedMps: number | null;
  recordedAt: string;
}

export interface PositionsPage {
  rows: PositionView[];
  nextCursor: string | null;
}

export interface ExportView {
  event: {
    id: string;
    name: string;
    mode: string;
    status: string;
    startsAt: string | null;
    endsAt: string | null;
  };
  participants: ExportParticipant[];
  missions: ExportMission[];
  zones: ExportZone[];
  timeline: TimelineEntry[];
  positionsCount: number;
  generatedAt: string;
}

/**
 * Subset of OperatorAnalyticsRow useful in a frozen export — keeps the export
 * shape independent from the analytics module's future field additions.
 */
export interface ExportParticipant {
  operatorId: string;
  callsign: string;
  missionsAttempted: number;
  missionsCompleted: number;
  pointsEarned: number;
  positionFixes: number;
  squadName: string | null;
  teamName: string | null;
}

export interface ExportMission {
  id: string;
  name: string;
  type: string;
  status: string;
  pointsReward: number;
  completions: number;
}

export interface ExportZone {
  id: string;
  name: string;
}
