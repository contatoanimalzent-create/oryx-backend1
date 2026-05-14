import { z } from 'zod';

import { type GeoPolygon, polygonSchema } from '../../../shared/geo/geo.dto';

const NAME_MIN = 2;
const NAME_MAX = 80;
const DESCRIPTION_MAX = 500;

const nameSchema = z.string().trim().min(NAME_MIN).max(NAME_MAX);
const descriptionSchema = z.string().trim().max(DESCRIPTION_MAX);

export const createZoneSchema = z.object({
  name: nameSchema,
  description: descriptionSchema.optional(),
  boundary: polygonSchema,
});

export const updateZoneSchema = z
  .object({
    name: nameSchema.optional(),
    description: descriptionSchema.nullable().optional(),
    boundary: polygonSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'PATCH body must contain at least one field.',
  });

export const zoneIdParamSchema = z.object({ id: z.string().uuid() });
export const eventIdParamSchema = z.object({ eventId: z.string().uuid() });

export type CreateZoneDto = z.infer<typeof createZoneSchema>;
export type UpdateZoneDto = z.infer<typeof updateZoneSchema>;

export interface ZoneView {
  id: string;
  eventId: string;
  name: string;
  description: string | null;
  boundary: GeoPolygon;
  createdAt: string;
  updatedAt: string;
}
