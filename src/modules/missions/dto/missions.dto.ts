import { MissionStatus, MissionType } from '@prisma/client';
import { z } from 'zod';

export { MissionStatus, MissionType };

const NAME_MIN = 2;
const NAME_MAX = 120;
const DESCRIPTION_MAX = 2000;
const POINTS_MAX = 10_000;

const nameSchema = z.string().trim().min(NAME_MIN).max(NAME_MAX);
const descriptionSchema = z.string().trim().max(DESCRIPTION_MAX);

// ─── Discriminated union by type ────────────────────────────────────────────
// Each variant validates the `config` shape its mission engine code expects.
// `zoneId` is required for spatial types and rejected for non-spatial ones —
// service still re-checks zone ownership against the event.

const baseFields = {
  name: nameSchema,
  description: descriptionSchema.optional(),
  // No `.default(0)` — Zod's discriminated-union output inference treats
  // defaulted fields as optional, which trips strict TS at the service
  // boundary. Clients send pointsReward explicitly (0 if not awarding).
  pointsReward: z.number().int().min(0).max(POINTS_MAX),
};

const captureSchema = z.object({
  type: z.literal(MissionType.CAPTURE),
  zoneId: z.string().uuid(),
  config: z.object({
    /** Continuous occupancy (seconds) required to flip a zone. */
    thresholdSeconds: z.number().int().positive().max(86_400),
  }),
  ...baseFields,
});

const defendSchema = z.object({
  type: z.literal(MissionType.DEFEND),
  zoneId: z.string().uuid(),
  config: z.object({
    /** Time the squad must hold the zone after capture. */
    durationSeconds: z.number().int().positive().max(86_400),
  }),
  ...baseFields,
});

const holdSchema = z.object({
  type: z.literal(MissionType.HOLD),
  zoneId: z.string().uuid(),
  config: z.object({
    durationSeconds: z.number().int().positive().max(86_400),
  }),
  ...baseFields,
});

const checkpointSchema = z.object({
  type: z.literal(MissionType.CHECKPOINT),
  zoneId: z.string().uuid(),
  config: z.object({}).strict(),
  ...baseFields,
});

const timeSchema = z.object({
  type: z.literal(MissionType.TIME),
  zoneId: z.string().uuid().optional(),
  config: z
    .object({
      windowStart: z.string().datetime(),
      windowEnd: z.string().datetime(),
    })
    .refine((v) => new Date(v.windowEnd) > new Date(v.windowStart), {
      message: 'windowEnd must be after windowStart',
    }),
  ...baseFields,
});

const squadSchema = z.object({
  type: z.literal(MissionType.SQUAD),
  zoneId: z.never().optional(), // not used
  config: z.object({
    targetSquadId: z.string().uuid().optional(),
  }),
  ...baseFields,
});

const factionSchema = z.object({
  type: z.literal(MissionType.FACTION),
  zoneId: z.never().optional(),
  config: z.object({
    targetTeamId: z.string().uuid().optional(),
  }),
  ...baseFields,
});

export const createMissionSchema = z.discriminatedUnion('type', [
  captureSchema,
  defendSchema,
  holdSchema,
  checkpointSchema,
  timeSchema,
  squadSchema,
  factionSchema,
]);

/**
 * PATCH only edits "metadata" — name/description/pointsReward/status. Changing
 * type/zoneId/config requires delete + recreate so the engine never sees a
 * mid-run mission whose meaning shifted (CLAUDE.md §3.6 — keep it simple).
 */
export const updateMissionSchema = z
  .object({
    name: nameSchema.optional(),
    description: descriptionSchema.nullable().optional(),
    pointsReward: z.number().int().min(0).max(POINTS_MAX).optional(),
    status: z.nativeEnum(MissionStatus).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'PATCH body must contain at least one field.',
  });

export const missionIdParamSchema = z.object({ id: z.string().uuid() });
export const eventIdParamSchema = z.object({ eventId: z.string().uuid() });

export const missionListQuerySchema = z.object({
  type: z.nativeEnum(MissionType).optional(),
  status: z.nativeEnum(MissionStatus).optional(),
});

export type CreateMissionDto = z.infer<typeof createMissionSchema>;
export type UpdateMissionDto = z.infer<typeof updateMissionSchema>;
export type MissionListQuery = z.infer<typeof missionListQuerySchema>;

export interface MissionView {
  id: string;
  eventId: string;
  type: MissionType;
  name: string;
  description: string | null;
  zoneId: string | null;
  config: unknown;
  pointsReward: number;
  status: MissionStatus;
  createdAt: string;
  updatedAt: string;
}

/// Mission types whose engine semantics require a zone. Used by the service
/// to detect "zone deleted out from under a spatial mission" cases.
export const SPATIAL_MISSION_TYPES: ReadonlyArray<MissionType> = [
  MissionType.CAPTURE,
  MissionType.DEFEND,
  MissionType.HOLD,
  MissionType.CHECKPOINT,
];
