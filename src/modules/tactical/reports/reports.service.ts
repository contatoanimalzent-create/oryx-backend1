import { Injectable, NotFoundException } from '@nestjs/common';
import { type Class, type Exercise, type UnitInstructor, type User } from '@prisma/client';

import { PrismaService } from '../../../shared/database/prisma.service';
import {
  type ClassReport,
  type ClassReportExercise,
  type ClassStatusBreakdown,
  type ExerciseStatusBreakdown,
  type UnitReport,
  type UnitReportClass,
  type UnitReportInstructor,
} from './reports.dto';

/**
 * Read-only data assembler for tactical reports. Kept distinct from
 * TacticalService (which owns 4-entity CRUD already) so the aggregation
 * surface can evolve independently — the responsibilities don't overlap.
 *
 * Breakdowns are computed in JS rather than SQL `CASE … GROUP BY` because
 * the data fits comfortably in memory at this size, and Prisma `include`
 * + relations gives a single round-trip per report.
 */
@Injectable()
export class TacticalReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getUnitReport(unitId: string): Promise<UnitReport> {
    const unit = await this.prisma.unit.findUnique({
      where: { id: unitId },
      include: {
        instructors: { include: { user: true }, orderBy: { assignedAt: 'asc' } },
        classes: {
          include: {
            leadInstructor: true,
            exercises: true,
          },
          orderBy: { startsAt: 'desc' },
        },
      },
    });
    if (!unit) throw new NotFoundException('Unit not found.');

    const allExercises: Exercise[] = unit.classes.flatMap((c) => c.exercises);

    return {
      meta: {
        id: unit.id,
        name: unit.name,
        abbreviation: unit.abbreviation,
        generatedAt: new Date().toISOString(),
      },
      summary: {
        instructorCount: unit.instructors.length,
        classCount: unit.classes.length,
        exerciseCount: allExercises.length,
        classesByStatus: countClasses(unit.classes),
        exercisesByStatus: countExercises(allExercises),
      },
      instructors: unit.instructors.map(
        (row): UnitReportInstructor => mapInstructor(row, row.user),
      ),
      classes: unit.classes.map(
        (c): UnitReportClass => ({
          id: c.id,
          name: c.name,
          status: c.status,
          startsAt: c.startsAt.toISOString(),
          endsAt: c.endsAt ? c.endsAt.toISOString() : null,
          leadInstructorName: c.leadInstructor.displayName,
          exerciseCount: c.exercises.length,
        }),
      ),
    };
  }

  async getClassReport(classId: string): Promise<ClassReport> {
    const klass = await this.prisma.class.findUnique({
      where: { id: classId },
      include: {
        unit: true,
        leadInstructor: true,
        exercises: { orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }] },
      },
    });
    if (!klass) throw new NotFoundException('Class not found.');

    const exercises = klass.exercises;
    const breakdown = countExercises(exercises);
    const completed = breakdown.COMPLETED;
    const total = exercises.length;
    const completionRate = total === 0 ? 0 : clamp01(completed / total);

    return {
      meta: {
        id: klass.id,
        name: klass.name,
        status: klass.status,
        startsAt: klass.startsAt.toISOString(),
        endsAt: klass.endsAt ? klass.endsAt.toISOString() : null,
        unitId: klass.unitId,
        unitName: klass.unit.name,
        leadInstructorId: klass.leadInstructorId,
        leadInstructorName: klass.leadInstructor.displayName,
        leadInstructorEmail: klass.leadInstructor.email,
        generatedAt: new Date().toISOString(),
      },
      summary: {
        exerciseCount: total,
        exercisesByStatus: breakdown,
        completionRate,
      },
      exercises: exercises.map(
        (e): ClassReportExercise => ({
          id: e.id,
          name: e.name,
          description: e.description,
          status: e.status,
          scheduledAt: e.scheduledAt ? e.scheduledAt.toISOString() : null,
          eventId: e.eventId,
        }),
      ),
    };
  }
}

function countClasses(classes: Class[]): ClassStatusBreakdown {
  const out: ClassStatusBreakdown = { PLANNED: 0, ACTIVE: 0, COMPLETED: 0, CANCELLED: 0 };
  for (const c of classes) out[c.status] += 1;
  return out;
}

function countExercises(exercises: Exercise[]): ExerciseStatusBreakdown {
  const out: ExerciseStatusBreakdown = { PLANNED: 0, RUNNING: 0, COMPLETED: 0, CANCELLED: 0 };
  for (const e of exercises) out[e.status] += 1;
  return out;
}

function mapInstructor(row: UnitInstructor, user: User): UnitReportInstructor {
  return {
    userId: user.id,
    displayName: user.displayName,
    email: user.email,
    assignedAt: row.assignedAt.toISOString(),
  };
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
