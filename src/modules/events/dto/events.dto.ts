import { EventMode, EventStatus } from '@prisma/client';
import { z } from 'zod';

import { type GeoPolygon, polygonSchema } from '../../../shared/geo/geo.dto';

export { EventMode, EventStatus };
// Re-exported so existing consumers of events.dto don't break — the canonical
// definition lives in shared/geo (CLAUDE.md §3.4: cross-module use goes
// through a shared utility, not deep imports).
export { polygonSchema, type GeoPolygon };

// ─── Event DTOs ─────────────────────────────────────────────────────────────

const NAME_MIN = 2;
const NAME_MAX = 120;
const DESCRIPTION_MAX = 2000;

const nameSchema = z.string().trim().min(NAME_MIN).max(NAME_MAX);
const descriptionSchema = z.string().trim().max(DESCRIPTION_MAX);

export const createEventSchema = z.object({
  name: nameSchema,
  description: descriptionSchema.optional(),
  mode: z.nativeEnum(EventMode),
  operationalArea: polygonSchema,
});

export const updateEventSchema = z
  .object({
    name: nameSchema.optional(),
    description: descriptionSchema.nullable().optional(),
    mode: z.nativeEnum(EventMode).optional(),
    operationalArea: polygonSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'PATCH body must contain at least one field.',
  });

export const eventIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const eventListQuerySchema = z.object({
  status: z.nativeEnum(EventStatus).optional(),
  mode: z.nativeEnum(EventMode).optional(),
});

export type CreateEventDto = z.infer<typeof createEventSchema>;
export type UpdateEventDto = z.infer<typeof updateEventSchema>;
export type EventListQuery = z.infer<typeof eventListQuerySchema>;

export interface EventView {
  id: string;
  name: string;
  description: string | null;
  mode: EventMode;
  status: EventStatus;
  operationalArea: GeoPolygon;
  startsAt: string | null;
  endsAt: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}
