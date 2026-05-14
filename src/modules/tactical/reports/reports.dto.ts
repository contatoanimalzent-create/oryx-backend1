import type { ClassStatus, ExerciseStatus } from '@prisma/client';

/**
 * Per-status counts. The four buckets always exist (zero when empty) so
 * consumers never have to guard against missing keys — easier to render
 * in tables, CSV columns, and PDFs.
 */
export interface ClassStatusBreakdown {
  PLANNED: number;
  ACTIVE: number;
  COMPLETED: number;
  CANCELLED: number;
}

export interface ExerciseStatusBreakdown {
  PLANNED: number;
  RUNNING: number;
  COMPLETED: number;
  CANCELLED: number;
}

// ─── Unit report ─────────────────────────────────────────────────────────

export interface UnitReportMeta {
  id: string;
  name: string;
  abbreviation: string | null;
  generatedAt: string;
}

export interface UnitReportSummary {
  instructorCount: number;
  classCount: number;
  exerciseCount: number;
  classesByStatus: ClassStatusBreakdown;
  exercisesByStatus: ExerciseStatusBreakdown;
}

export interface UnitReportInstructor {
  userId: string;
  displayName: string;
  email: string;
  assignedAt: string;
}

export interface UnitReportClass {
  id: string;
  name: string;
  status: ClassStatus;
  startsAt: string;
  endsAt: string | null;
  leadInstructorName: string;
  exerciseCount: number;
}

export interface UnitReport {
  meta: UnitReportMeta;
  summary: UnitReportSummary;
  instructors: UnitReportInstructor[];
  classes: UnitReportClass[];
}

// ─── Class report ────────────────────────────────────────────────────────

export interface ClassReportMeta {
  id: string;
  name: string;
  status: ClassStatus;
  startsAt: string;
  endsAt: string | null;
  unitId: string;
  unitName: string;
  leadInstructorId: string;
  leadInstructorName: string;
  leadInstructorEmail: string;
  generatedAt: string;
}

export interface ClassReportSummary {
  exerciseCount: number;
  exercisesByStatus: ExerciseStatusBreakdown;
  /**
   * `completionRate` is `completed / total` clamped to [0, 1]. Zero when
   * there are no exercises yet (no NaN).
   */
  completionRate: number;
}

export interface ClassReportExercise {
  id: string;
  name: string;
  description: string | null;
  status: ExerciseStatus;
  scheduledAt: string | null;
  eventId: string | null;
}

export interface ClassReport {
  meta: ClassReportMeta;
  summary: ClassReportSummary;
  exercises: ClassReportExercise[];
}
