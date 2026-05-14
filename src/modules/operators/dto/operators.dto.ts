import { BloodType, OperatorStatus } from '@prisma/client';
import { z } from 'zod';

export { BloodType, OperatorStatus };

const CALLSIGN_MIN = 2;
const CALLSIGN_MAX = 32;
// Operations-friendly callsign: letters, digits, dot, dash, underscore.
// No spaces, no symbols that complicate radio dispatch.
const CALLSIGN_REGEX = /^[A-Za-z0-9._-]+$/;

const BIO_MAX = 500;
const EMERGENCY_MAX = 200;

const callsignSchema = z
  .string()
  .trim()
  .min(CALLSIGN_MIN)
  .max(CALLSIGN_MAX)
  .regex(CALLSIGN_REGEX, 'callsign may only contain letters, digits, ".", "-" or "_"');

const bioSchema = z.string().trim().max(BIO_MAX);
const emergencySchema = z.string().trim().max(EMERGENCY_MAX);

export const createOperatorSchema = z.object({
  callsign: callsignSchema,
  bio: bioSchema.optional(),
  emergencyContact: emergencySchema.optional(),
  bloodType: z.nativeEnum(BloodType).optional(),
});

export const updateOperatorSchema = z
  .object({
    callsign: callsignSchema.optional(),
    bio: bioSchema.nullable().optional(),
    emergencyContact: emergencySchema.nullable().optional(),
    bloodType: z.nativeEnum(BloodType).optional(),
    status: z.nativeEnum(OperatorStatus).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'PATCH body must contain at least one field.',
  });

export const operatorIdParamSchema = z.object({
  id: z.string().uuid(),
});

export type CreateOperatorDto = z.infer<typeof createOperatorSchema>;
export type UpdateOperatorDto = z.infer<typeof updateOperatorSchema>;

/// Public projection of an Operator. user_id is hidden because consumers go
/// through /operators/me or /operators/:id (Operator id), not user id.
export interface OperatorView {
  id: string;
  callsign: string;
  bio: string | null;
  emergencyContact: string | null;
  bloodType: BloodType;
  status: OperatorStatus;
  createdAt: string;
  updatedAt: string;
}
