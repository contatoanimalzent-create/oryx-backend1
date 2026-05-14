import { z } from 'zod';

/**
 * Shared GeoJSON RFC 7946 validation. Used by events.operationalArea (1.4),
 * zones.boundary (1.11), and any future module that takes spatial polygons.
 *
 * 2D positions only — altitude (3rd element) is intentionally rejected so
 * downstream PostGIS math (ST_Within / ST_Contains) stays uniform.
 */

const longitudeSchema = z.number().min(-180).max(180);
const latitudeSchema = z.number().min(-90).max(90);
const positionSchema = z.tuple([longitudeSchema, latitudeSchema]);

const linearRingSchema = z
  .array(positionSchema)
  .min(4, 'a linear ring needs at least 4 positions (with first == last)')
  .refine(
    (ring) => {
      const first = ring[0];
      const last = ring[ring.length - 1];
      return first[0] === last[0] && first[1] === last[1];
    },
    { message: 'first and last positions of a ring must match (closed ring)' },
  );

export const polygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(linearRingSchema).min(1, 'a Polygon must have at least the exterior ring'),
});

export type GeoPolygon = z.infer<typeof polygonSchema>;
