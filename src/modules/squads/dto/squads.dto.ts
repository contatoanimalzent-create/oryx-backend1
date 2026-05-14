import { SquadStatus } from '@prisma/client';
import { z } from 'zod';

export { SquadStatus };

const NAME_MIN = 2;
const NAME_MAX = 80;
const DESCRIPTION_MAX = 500;

const nameSchema = z.string().trim().min(NAME_MIN).max(NAME_MAX);
const descriptionSchema = z.string().trim().max(DESCRIPTION_MAX);

export const createSquadSchema = z.object({
  name: nameSchema,
  description: descriptionSchema.optional(),
});

export const updateSquadSchema = z
  .object({
    name: nameSchema.optional(),
    description: descriptionSchema.nullable().optional(),
    leaderId: z.string().uuid().nullable().optional(),
    status: z.nativeEnum(SquadStatus).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'PATCH body must contain at least one field.',
  });

export const addMemberSchema = z.object({
  operatorId: z.string().uuid(),
});

export const squadIdParamSchema = z.object({ id: z.string().uuid() });
export const teamIdParamSchema = z.object({ teamId: z.string().uuid() });
export const memberParamSchema = z.object({
  id: z.string().uuid(),
  operatorId: z.string().uuid(),
});

export type CreateSquadDto = z.infer<typeof createSquadSchema>;
export type UpdateSquadDto = z.infer<typeof updateSquadSchema>;
export type AddMemberDto = z.infer<typeof addMemberSchema>;

export interface SquadMemberView {
  operatorId: string;
  callsign: string;
  joinedAt: string;
}

export interface SquadView {
  id: string;
  teamId: string;
  name: string;
  description: string | null;
  leaderId: string | null;
  status: SquadStatus;
  createdAt: string;
  updatedAt: string;
  members: SquadMemberView[];
}
