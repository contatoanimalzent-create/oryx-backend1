import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type Class,
  EventMode,
  type Exercise,
  Role,
  type Unit,
  type UnitInstructor,
  type User,
} from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import {
  type AssignInstructorDto,
  type ClassView,
  type CreateClassDto,
  type CreateExerciseDto,
  type CreateUnitDto,
  type ExerciseView,
  type InstructorAssignmentView,
  type UnitView,
  type UpdateClassDto,
  type UpdateExerciseDto,
  type UpdateUnitDto,
} from './dto/tactical.dto';

/**
 * Tactical layer (sessão 1.21). One service holds the 4 entity surfaces
 * (Unit, UnitInstructor, Class, Exercise) so the cross-entity guards
 * (admin-or-assigned-instructor, parent has children) live next to the
 * data they protect — splitting into 4 services would duplicate those
 * helpers without buying isolation we don't need yet.
 *
 * Permission rule on Class/Exercise write paths: caller is ADMIN, OR
 * caller is INSTRUCTOR and has a `unit_instructors` row on the parent
 * unit. Anyone authenticated can read. RolesGuard at the controller
 * narrows to ADMIN/INSTRUCTOR up front; the service enforces the
 * unit-association part.
 */
@Injectable()
export class TacticalService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Unit ───────────────────────────────────────────────────────────────

  async createUnit(dto: CreateUnitDto): Promise<UnitView> {
    try {
      const unit = await this.prisma.unit.create({
        data: { name: dto.name, abbreviation: dto.abbreviation ?? null },
      });
      return this.toUnitView(unit, 0, 0);
    } catch (err) {
      throw this.translateUniqueViolation(err, 'A unit with that name already exists.');
    }
  }

  async listUnits(): Promise<UnitView[]> {
    const rows = await this.prisma.unit.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { classes: true, instructors: true } } },
    });
    return rows.map((u) => this.toUnitView(u, u._count.classes, u._count.instructors));
  }

  async getUnit(id: string): Promise<UnitView> {
    const unit = await this.prisma.unit.findUnique({
      where: { id },
      include: { _count: { select: { classes: true, instructors: true } } },
    });
    if (!unit) throw new NotFoundException('Unit not found.');
    return this.toUnitView(unit, unit._count.classes, unit._count.instructors);
  }

  async updateUnit(id: string, dto: UpdateUnitDto): Promise<UnitView> {
    await this.requireUnit(id);
    try {
      const unit = await this.prisma.unit.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.abbreviation !== undefined && { abbreviation: dto.abbreviation }),
        },
        include: { _count: { select: { classes: true, instructors: true } } },
      });
      return this.toUnitView(unit, unit._count.classes, unit._count.instructors);
    } catch (err) {
      throw this.translateUniqueViolation(err, 'A unit with that name already exists.');
    }
  }

  async deleteUnit(id: string): Promise<void> {
    const unit = await this.prisma.unit.findUnique({
      where: { id },
      include: { _count: { select: { classes: true } } },
    });
    if (!unit) throw new NotFoundException('Unit not found.');
    if (unit._count.classes > 0) {
      throw new ConflictException(
        `Unit has ${unit._count.classes} class(es); delete them before removing the unit.`,
      );
    }
    await this.prisma.unit.delete({ where: { id } });
  }

  // ─── Instructor assignments ─────────────────────────────────────────────

  async assignInstructor(
    unitId: string,
    dto: AssignInstructorDto,
  ): Promise<InstructorAssignmentView> {
    await this.requireUnit(unitId);
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('User not found.');
    if (user.role !== Role.INSTRUCTOR) {
      throw new BadRequestException('Only users with role INSTRUCTOR can be assigned to a unit.');
    }
    try {
      const row = await this.prisma.unitInstructor.create({
        data: { unitId, userId: dto.userId },
        include: { user: true },
      });
      return this.toAssignmentView(row, row.user);
    } catch (err) {
      throw this.translateUniqueViolation(err, 'Instructor is already assigned to this unit.');
    }
  }

  async listUnitInstructors(unitId: string): Promise<InstructorAssignmentView[]> {
    await this.requireUnit(unitId);
    const rows = await this.prisma.unitInstructor.findMany({
      where: { unitId },
      orderBy: { assignedAt: 'asc' },
      include: { user: true },
    });
    return rows.map((r) => this.toAssignmentView(r, r.user));
  }

  async removeInstructor(unitId: string, userId: string): Promise<void> {
    await this.requireUnit(unitId);
    const row = await this.prisma.unitInstructor.findUnique({
      where: { unitId_userId: { unitId, userId } },
    });
    if (!row) throw new NotFoundException('Instructor is not assigned to this unit.');
    await this.prisma.unitInstructor.delete({
      where: { unitId_userId: { unitId, userId } },
    });
  }

  // ─── Class ──────────────────────────────────────────────────────────────

  async createClass(
    actor: { id: string; role: Role },
    unitId: string,
    dto: CreateClassDto,
  ): Promise<ClassView> {
    await this.requireUnit(unitId);
    await this.requireInstructorAssoc(actor, unitId);
    const leader = await this.prisma.user.findUnique({ where: { id: dto.leadInstructorId } });
    if (!leader) throw new NotFoundException('Lead instructor user not found.');
    if (leader.role !== Role.INSTRUCTOR) {
      throw new BadRequestException('leadInstructor must have role INSTRUCTOR.');
    }
    if (dto.endsAt && new Date(dto.endsAt) <= new Date(dto.startsAt)) {
      throw new BadRequestException('endsAt must be after startsAt.');
    }

    const klass = await this.prisma.class.create({
      data: {
        unitId,
        leadInstructorId: dto.leadInstructorId,
        name: dto.name,
        startsAt: new Date(dto.startsAt),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      },
      include: { leadInstructor: true, _count: { select: { exercises: true } } },
    });
    return this.toClassView(klass, klass.leadInstructor.displayName, klass._count.exercises);
  }

  async listClassesByUnit(unitId: string): Promise<ClassView[]> {
    await this.requireUnit(unitId);
    const rows = await this.prisma.class.findMany({
      where: { unitId },
      orderBy: { startsAt: 'desc' },
      include: { leadInstructor: true, _count: { select: { exercises: true } } },
    });
    return rows.map((c) => this.toClassView(c, c.leadInstructor.displayName, c._count.exercises));
  }

  async getClass(id: string): Promise<ClassView> {
    const klass = await this.prisma.class.findUnique({
      where: { id },
      include: { leadInstructor: true, _count: { select: { exercises: true } } },
    });
    if (!klass) throw new NotFoundException('Class not found.');
    return this.toClassView(klass, klass.leadInstructor.displayName, klass._count.exercises);
  }

  async updateClass(
    actor: { id: string; role: Role },
    id: string,
    dto: UpdateClassDto,
  ): Promise<ClassView> {
    const existing = await this.prisma.class.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Class not found.');
    await this.requireInstructorAssoc(actor, existing.unitId);

    if (dto.leadInstructorId) {
      const leader = await this.prisma.user.findUnique({ where: { id: dto.leadInstructorId } });
      if (!leader) throw new NotFoundException('Lead instructor user not found.');
      if (leader.role !== Role.INSTRUCTOR) {
        throw new BadRequestException('leadInstructor must have role INSTRUCTOR.');
      }
    }

    const newStartsAt = dto.startsAt !== undefined ? new Date(dto.startsAt) : existing.startsAt;
    const newEndsAt =
      dto.endsAt === undefined
        ? existing.endsAt
        : dto.endsAt === null
          ? null
          : new Date(dto.endsAt);
    if (newEndsAt && newEndsAt <= newStartsAt) {
      throw new BadRequestException('endsAt must be after startsAt.');
    }

    const klass = await this.prisma.class.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.leadInstructorId !== undefined && { leadInstructorId: dto.leadInstructorId }),
        ...(dto.startsAt !== undefined && { startsAt: new Date(dto.startsAt) }),
        ...(dto.endsAt !== undefined && {
          endsAt: dto.endsAt === null ? null : new Date(dto.endsAt),
        }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
      include: { leadInstructor: true, _count: { select: { exercises: true } } },
    });
    return this.toClassView(klass, klass.leadInstructor.displayName, klass._count.exercises);
  }

  async deleteClass(actor: { id: string; role: Role }, id: string): Promise<void> {
    const klass = await this.prisma.class.findUnique({
      where: { id },
      include: { _count: { select: { exercises: true } } },
    });
    if (!klass) throw new NotFoundException('Class not found.');
    await this.requireInstructorAssoc(actor, klass.unitId);
    if (klass._count.exercises > 0) {
      throw new ConflictException(
        `Class has ${klass._count.exercises} exercise(s); delete them before removing the class.`,
      );
    }
    await this.prisma.class.delete({ where: { id } });
  }

  // ─── Exercise ──────────────────────────────────────────────────────────

  async createExercise(
    actor: { id: string; role: Role },
    classId: string,
    dto: CreateExerciseDto,
  ): Promise<ExerciseView> {
    const klass = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!klass) throw new NotFoundException('Class not found.');
    await this.requireInstructorAssoc(actor, klass.unitId);
    if (dto.eventId) {
      await this.requireTrainingEvent(dto.eventId);
    }
    try {
      const ex = await this.prisma.exercise.create({
        data: {
          classId,
          name: dto.name,
          description: dto.description ?? null,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
          eventId: dto.eventId ?? null,
        },
      });
      return this.toExerciseView(ex);
    } catch (err) {
      throw this.translateUniqueViolation(err, 'That event is already linked to another exercise.');
    }
  }

  async listExercisesByClass(classId: string): Promise<ExerciseView[]> {
    const klass = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!klass) throw new NotFoundException('Class not found.');
    const rows = await this.prisma.exercise.findMany({
      where: { classId },
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((e) => this.toExerciseView(e));
  }

  async getExercise(id: string): Promise<ExerciseView> {
    const ex = await this.prisma.exercise.findUnique({ where: { id } });
    if (!ex) throw new NotFoundException('Exercise not found.');
    return this.toExerciseView(ex);
  }

  async updateExercise(
    actor: { id: string; role: Role },
    id: string,
    dto: UpdateExerciseDto,
  ): Promise<ExerciseView> {
    const existing = await this.prisma.exercise.findUnique({
      where: { id },
      include: { class: true },
    });
    if (!existing) throw new NotFoundException('Exercise not found.');
    await this.requireInstructorAssoc(actor, existing.class.unitId);

    if (dto.eventId) {
      await this.requireTrainingEvent(dto.eventId);
    }

    try {
      const ex = await this.prisma.exercise.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.scheduledAt !== undefined && {
            scheduledAt: dto.scheduledAt === null ? null : new Date(dto.scheduledAt),
          }),
          ...(dto.eventId !== undefined && { eventId: dto.eventId }),
          ...(dto.status !== undefined && { status: dto.status }),
        },
      });
      return this.toExerciseView(ex);
    } catch (err) {
      throw this.translateUniqueViolation(err, 'That event is already linked to another exercise.');
    }
  }

  async deleteExercise(actor: { id: string; role: Role }, id: string): Promise<void> {
    const ex = await this.prisma.exercise.findUnique({
      where: { id },
      include: { class: true },
    });
    if (!ex) throw new NotFoundException('Exercise not found.');
    await this.requireInstructorAssoc(actor, ex.class.unitId);
    await this.prisma.exercise.delete({ where: { id } });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  private async requireUnit(id: string): Promise<void> {
    const exists = await this.prisma.unit.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Unit not found.');
  }

  private async requireInstructorAssoc(
    actor: { id: string; role: Role },
    unitId: string,
  ): Promise<void> {
    if (actor.role === Role.ADMIN) return;
    if (actor.role !== Role.INSTRUCTOR) {
      throw new ForbiddenException('Caller role cannot manage tactical resources.');
    }
    const assoc = await this.prisma.unitInstructor.findUnique({
      where: { unitId_userId: { unitId, userId: actor.id } },
    });
    if (!assoc) {
      throw new ForbiddenException('Instructor is not assigned to this unit.');
    }
  }

  private async requireTrainingEvent(eventId: string): Promise<void> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Linked event not found.');
    if (event.mode !== EventMode.TACTICAL_TRAINING) {
      throw new BadRequestException(
        `Linked event mode is ${event.mode}; exercises only accept events with mode TACTICAL_TRAINING.`,
      );
    }
  }

  private toUnitView(unit: Unit, classCount: number, instructorCount: number): UnitView {
    return {
      id: unit.id,
      name: unit.name,
      abbreviation: unit.abbreviation,
      classCount,
      instructorCount,
      createdAt: unit.createdAt.toISOString(),
      updatedAt: unit.updatedAt.toISOString(),
    };
  }

  private toAssignmentView(row: UnitInstructor, user: User): InstructorAssignmentView {
    return {
      unitId: row.unitId,
      userId: row.userId,
      displayName: user.displayName,
      email: user.email,
      assignedAt: row.assignedAt.toISOString(),
    };
  }

  private toClassView(klass: Class, leadInstructorName: string, exerciseCount: number): ClassView {
    return {
      id: klass.id,
      unitId: klass.unitId,
      leadInstructorId: klass.leadInstructorId,
      leadInstructorName,
      name: klass.name,
      startsAt: klass.startsAt.toISOString(),
      endsAt: klass.endsAt ? klass.endsAt.toISOString() : null,
      status: klass.status,
      exerciseCount,
      createdAt: klass.createdAt.toISOString(),
      updatedAt: klass.updatedAt.toISOString(),
    };
  }

  private toExerciseView(ex: Exercise): ExerciseView {
    return {
      id: ex.id,
      classId: ex.classId,
      eventId: ex.eventId,
      name: ex.name,
      description: ex.description,
      scheduledAt: ex.scheduledAt ? ex.scheduledAt.toISOString() : null,
      status: ex.status,
      createdAt: ex.createdAt.toISOString(),
      updatedAt: ex.updatedAt.toISOString(),
    };
  }

  private translateUniqueViolation(err: unknown, message: string): Error {
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code?: string }).code === 'P2002'
    ) {
      return new ConflictException(message);
    }
    return err as Error;
  }
}
