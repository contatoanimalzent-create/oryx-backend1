import { ClassStatus, ExerciseStatus } from '@prisma/client';
import { z } from 'zod';

export { ClassStatus, ExerciseStatus };

const nameSchema = z.string().trim().min(2).max(120);
const abbrSchema = z.string().trim().min(1).max(16);
const descriptionSchema = z.string().trim().max(2_000);

// ─── ID params ─────────────────────────────────────────────────────────────

export const unitIdParamSchema = z.object({ id: z.string().uuid() });
export const unitIdInPathSchema = z.object({ unitId: z.string().uuid() });
export const classIdParamSchema = z.object({ id: z.string().uuid() });
export const classIdInPathSchema = z.object({ classId: z.string().uuid() });
export const exerciseIdParamSchema = z.object({ id: z.string().uuid() });
export const instructorMemberParamSchema = z.object({
  unitId: z.string().uuid(),
  userId: z.string().uuid(),
});

// ─── Unit ──────────────────────────────────────────────────────────────────

export const createUnitSchema = z.object({
  name: nameSchema,
  abbreviation: abbrSchema.optional(),
});

export const updateUnitSchema = z
  .object({
    name: nameSchema.optional(),
    abbreviation: abbrSchema.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required.' });

export type CreateUnitDto = z.infer<typeof createUnitSchema>;
export type UpdateUnitDto = z.infer<typeof updateUnitSchema>;

export interface UnitView {
  id: string;
  name: string;
  abbreviation: string | null;
  classCount: number;
  instructorCount: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Instructor assignment ─────────────────────────────────────────────────

export const assignInstructorSchema = z.object({
  userId: z.string().uuid(),
});
export type AssignInstructorDto = z.infer<typeof assignInstructorSchema>;

export interface InstructorAssignmentView {
  unitId: string;
  userId: string;
  displayName: string;
  email: string;
  assignedAt: string;
}

// ─── Class ─────────────────────────────────────────────────────────────────

export const createClassSchema = z.object({
  name: nameSchema,
  leadInstructorId: z.string().uuid(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
});

export const updateClassSchema = z
  .object({
    name: nameSchema.optional(),
    leadInstructorId: z.string().uuid().optional(),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().nullable().optional(),
    status: z.nativeEnum(ClassStatus).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required.' });

export type CreateClassDto = z.infer<typeof createClassSchema>;
export type UpdateClassDto = z.infer<typeof updateClassSchema>;

export interface ClassView {
  id: string;
  unitId: string;
  leadInstructorId: string;
  leadInstructorName: string;
  name: string;
  startsAt: string;
  endsAt: string | null;
  status: ClassStatus;
  exerciseCount: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Exercise ──────────────────────────────────────────────────────────────

export const createExerciseSchema = z.object({
  name: nameSchema,
  description: descriptionSchema.optional(),
  scheduledAt: z.string().datetime().optional(),
  eventId: z.string().uuid().optional(),
});

export const updateExerciseSchema = z
  .object({
    name: nameSchema.optional(),
    description: descriptionSchema.nullable().optional(),
    scheduledAt: z.string().datetime().nullable().optional(),
    eventId: z.string().uuid().nullable().optional(),
    status: z.nativeEnum(ExerciseStatus).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required.' });

export type CreateExerciseDto = z.infer<typeof createExerciseSchema>;
export type UpdateExerciseDto = z.infer<typeof updateExerciseSchema>;

export interface ExerciseView {
  id: string;
  classId: string;
  eventId: string | null;
  name: string;
  description: string | null;
  scheduledAt: string | null;
  status: ExerciseStatus;
  createdAt: string;
  updatedAt: string;
}
