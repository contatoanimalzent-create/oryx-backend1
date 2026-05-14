import { z } from 'zod';

const NAME_MIN = 2;
const NAME_MAX = 80;
const DESCRIPTION_MAX = 500;
const EMBLEM_MAX = 255;

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

const nameSchema = z.string().trim().min(NAME_MIN).max(NAME_MAX);
const colorSchema = z
  .string()
  .trim()
  .regex(HEX_COLOR_REGEX, 'color must be a #RRGGBB hex string')
  .transform((v) => v.toLowerCase());
const emblemSchema = z.string().trim().max(EMBLEM_MAX);
const descriptionSchema = z.string().trim().max(DESCRIPTION_MAX);

export const createTeamSchema = z.object({
  name: nameSchema,
  color: colorSchema,
  emblem: emblemSchema.optional(),
  description: descriptionSchema.optional(),
});

export const updateTeamSchema = z
  .object({
    name: nameSchema.optional(),
    color: colorSchema.optional(),
    emblem: emblemSchema.nullable().optional(),
    description: descriptionSchema.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'PATCH body must contain at least one field.',
  });

export const teamIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const eventIdParamSchema = z.object({
  eventId: z.string().uuid(),
});

export type CreateTeamDto = z.infer<typeof createTeamSchema>;
export type UpdateTeamDto = z.infer<typeof updateTeamSchema>;

export interface TeamView {
  id: string;
  eventId: string;
  name: string;
  color: string;
  emblem: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}
