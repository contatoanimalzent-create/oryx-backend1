import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ClassStatus, EventMode, ExerciseStatus, Role } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../../shared/database/prisma.service';
import { TacticalService } from './tactical.service';

const UNIT_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const ADMIN_ID = '33333333-3333-3333-3333-333333333333';
const CLASS_ID = '44444444-4444-4444-4444-444444444444';
const EXERCISE_ID = '55555555-5555-5555-5555-555555555555';
const EVENT_ID = '66666666-6666-6666-6666-666666666666';

const ADMIN_ACTOR = { id: ADMIN_ID, role: Role.ADMIN };
const INSTRUCTOR_ACTOR = { id: USER_ID, role: Role.INSTRUCTOR };
const OPERATOR_ACTOR = { id: USER_ID, role: Role.OPERATOR };

const NOW = new Date('2026-05-12T20:00:00Z');
const LATER = new Date('2026-05-12T22:00:00Z');

const UNIT_ROW = {
  id: UNIT_ID,
  name: 'Unit A',
  abbreviation: 'U-A',
  createdAt: NOW,
  updatedAt: NOW,
};

describe('TacticalService', () => {
  let service: TacticalService;
  let prisma: {
    unit: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    unitInstructor: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    class: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    exercise: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    user: { findUnique: ReturnType<typeof vi.fn> };
    event: { findUnique: ReturnType<typeof vi.fn> };
  };

  beforeEach(async () => {
    prisma = {
      unit: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      unitInstructor: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        delete: vi.fn(),
      },
      class: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      exercise: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      user: { findUnique: vi.fn() },
      event: { findUnique: vi.fn() },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [TacticalService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(TacticalService);
  });

  afterEach(() => vi.restoreAllMocks());

  // ─── Unit ──────────────────────────────────────────────────────────────

  describe('Unit', () => {
    it('creates a unit and shapes the view', async () => {
      prisma.unit.create.mockResolvedValueOnce(UNIT_ROW);
      const view = await service.createUnit({ name: 'Unit A' });
      expect(view).toMatchObject({
        id: UNIT_ID,
        name: 'Unit A',
        classCount: 0,
        instructorCount: 0,
      });
    });

    it('translates P2002 unique-violation into 409', async () => {
      const err = Object.assign(new Error('uq'), { code: 'P2002' });
      prisma.unit.create.mockRejectedValueOnce(err);
      await expect(service.createUnit({ name: 'dup' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects delete when unit has classes (409)', async () => {
      prisma.unit.findUnique.mockResolvedValueOnce({
        ...UNIT_ROW,
        _count: { classes: 2 },
      });
      await expect(service.deleteUnit(UNIT_ID)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.unit.delete).not.toHaveBeenCalled();
    });

    it('deletes unit when no classes', async () => {
      prisma.unit.findUnique.mockResolvedValueOnce({ ...UNIT_ROW, _count: { classes: 0 } });
      prisma.unit.delete.mockResolvedValueOnce(UNIT_ROW);
      await service.deleteUnit(UNIT_ID);
      expect(prisma.unit.delete).toHaveBeenCalledWith({ where: { id: UNIT_ID } });
    });

    it('404 when unit not found', async () => {
      prisma.unit.findUnique.mockResolvedValueOnce(null);
      await expect(service.getUnit(UNIT_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── Instructor assignments ────────────────────────────────────────────

  describe('Instructor assignments', () => {
    it('rejects assigning a non-INSTRUCTOR user (400)', async () => {
      prisma.unit.findUnique.mockResolvedValueOnce(UNIT_ROW);
      prisma.user.findUnique.mockResolvedValueOnce({
        id: USER_ID,
        role: Role.OPERATOR,
        displayName: 'X',
        email: 'x@o.test',
      });
      await expect(service.assignInstructor(UNIT_ID, { userId: USER_ID })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('translates duplicate assignment into 409', async () => {
      prisma.unit.findUnique.mockResolvedValueOnce(UNIT_ROW);
      prisma.user.findUnique.mockResolvedValueOnce({
        id: USER_ID,
        role: Role.INSTRUCTOR,
        displayName: 'I',
        email: 'i@o.test',
      });
      const err = Object.assign(new Error('uq'), { code: 'P2002' });
      prisma.unitInstructor.create.mockRejectedValueOnce(err);
      await expect(service.assignInstructor(UNIT_ID, { userId: USER_ID })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('happy path returns view', async () => {
      prisma.unit.findUnique.mockResolvedValueOnce(UNIT_ROW);
      prisma.user.findUnique.mockResolvedValueOnce({
        id: USER_ID,
        role: Role.INSTRUCTOR,
        displayName: 'Inst',
        email: 'i@o.test',
      });
      prisma.unitInstructor.create.mockResolvedValueOnce({
        unitId: UNIT_ID,
        userId: USER_ID,
        assignedAt: NOW,
        user: { id: USER_ID, displayName: 'Inst', email: 'i@o.test' },
      });
      const view = await service.assignInstructor(UNIT_ID, { userId: USER_ID });
      expect(view).toMatchObject({ unitId: UNIT_ID, userId: USER_ID, displayName: 'Inst' });
    });
  });

  // ─── Class ─────────────────────────────────────────────────────────────

  describe('Class permission gates', () => {
    it('ADMIN bypasses instructor-association check', async () => {
      prisma.unit.findUnique.mockResolvedValueOnce(UNIT_ROW);
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'lead',
        role: Role.INSTRUCTOR,
        displayName: 'L',
        email: 'l@o.test',
      });
      prisma.class.create.mockResolvedValueOnce({
        id: CLASS_ID,
        unitId: UNIT_ID,
        leadInstructorId: 'lead',
        name: 'T-1',
        startsAt: NOW,
        endsAt: LATER,
        status: ClassStatus.PLANNED,
        createdAt: NOW,
        updatedAt: NOW,
        leadInstructor: { displayName: 'L' },
        _count: { exercises: 0 },
      });

      const view = await service.createClass(ADMIN_ACTOR, UNIT_ID, {
        name: 'T-1',
        leadInstructorId: 'lead',
        startsAt: NOW.toISOString(),
        endsAt: LATER.toISOString(),
      });
      expect(view.status).toBe(ClassStatus.PLANNED);
      // ADMIN doesn't trigger the assoc lookup.
      expect(prisma.unitInstructor.findUnique).not.toHaveBeenCalled();
    });

    it('INSTRUCTOR without assignment is forbidden', async () => {
      prisma.unit.findUnique.mockResolvedValueOnce(UNIT_ROW);
      prisma.unitInstructor.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.createClass(INSTRUCTOR_ACTOR, UNIT_ID, {
          name: 'T-1',
          leadInstructorId: 'lead',
          startsAt: NOW.toISOString(),
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('OPERATOR is forbidden (not an instructor)', async () => {
      prisma.unit.findUnique.mockResolvedValueOnce(UNIT_ROW);
      await expect(
        service.createClass(OPERATOR_ACTOR, UNIT_ID, {
          name: 'T-1',
          leadInstructorId: 'lead',
          startsAt: NOW.toISOString(),
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects when endsAt is before startsAt', async () => {
      prisma.unit.findUnique.mockResolvedValueOnce(UNIT_ROW);
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'lead',
        role: Role.INSTRUCTOR,
        displayName: 'L',
        email: 'l@o.test',
      });
      await expect(
        service.createClass(ADMIN_ACTOR, UNIT_ID, {
          name: 'T-1',
          leadInstructorId: 'lead',
          startsAt: LATER.toISOString(),
          endsAt: NOW.toISOString(),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects lead instructor that is not INSTRUCTOR', async () => {
      prisma.unit.findUnique.mockResolvedValueOnce(UNIT_ROW);
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'lead',
        role: Role.OPERATOR,
        displayName: 'L',
        email: 'l@o.test',
      });
      await expect(
        service.createClass(ADMIN_ACTOR, UNIT_ID, {
          name: 'T-1',
          leadInstructorId: 'lead',
          startsAt: NOW.toISOString(),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('blocks delete when class has exercises (409)', async () => {
      prisma.class.findUnique.mockResolvedValueOnce({
        id: CLASS_ID,
        unitId: UNIT_ID,
        _count: { exercises: 3 },
      });
      await expect(service.deleteClass(ADMIN_ACTOR, CLASS_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  // ─── Exercise ──────────────────────────────────────────────────────────

  describe('Exercise', () => {
    it('rejects eventId for an event whose mode is not TACTICAL_TRAINING', async () => {
      prisma.class.findUnique.mockResolvedValueOnce({ id: CLASS_ID, unitId: UNIT_ID });
      prisma.event.findUnique.mockResolvedValueOnce({ id: EVENT_ID, mode: EventMode.WARFARE });
      await expect(
        service.createExercise(ADMIN_ACTOR, CLASS_ID, { name: 'Drill', eventId: EVENT_ID }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts eventId when mode is TACTICAL_TRAINING', async () => {
      prisma.class.findUnique.mockResolvedValueOnce({ id: CLASS_ID, unitId: UNIT_ID });
      prisma.event.findUnique.mockResolvedValueOnce({
        id: EVENT_ID,
        mode: EventMode.TACTICAL_TRAINING,
      });
      prisma.exercise.create.mockResolvedValueOnce({
        id: EXERCISE_ID,
        classId: CLASS_ID,
        eventId: EVENT_ID,
        name: 'Drill',
        description: null,
        scheduledAt: null,
        status: ExerciseStatus.PLANNED,
        createdAt: NOW,
        updatedAt: NOW,
      });
      const view = await service.createExercise(ADMIN_ACTOR, CLASS_ID, {
        name: 'Drill',
        eventId: EVENT_ID,
      });
      expect(view.eventId).toBe(EVENT_ID);
      expect(view.status).toBe(ExerciseStatus.PLANNED);
    });

    it('P2002 on eventId (already linked to another exercise) → 409', async () => {
      prisma.class.findUnique.mockResolvedValueOnce({ id: CLASS_ID, unitId: UNIT_ID });
      prisma.event.findUnique.mockResolvedValueOnce({
        id: EVENT_ID,
        mode: EventMode.TACTICAL_TRAINING,
      });
      const err = Object.assign(new Error('uq'), { code: 'P2002' });
      prisma.exercise.create.mockRejectedValueOnce(err);
      await expect(
        service.createExercise(ADMIN_ACTOR, CLASS_ID, {
          name: 'Drill',
          eventId: EVENT_ID,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('INSTRUCTOR without unit assoc cannot create', async () => {
      prisma.class.findUnique.mockResolvedValueOnce({ id: CLASS_ID, unitId: UNIT_ID });
      prisma.unitInstructor.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.createExercise(INSTRUCTOR_ACTOR, CLASS_ID, { name: 'Drill' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('404 on exercise not found', async () => {
      prisma.exercise.findUnique.mockResolvedValueOnce(null);
      await expect(service.getExercise(EXERCISE_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
