import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ClassStatus, ExerciseStatus } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../../../shared/database/prisma.service';
import { TacticalReportsService } from './reports.service';

const UNIT_ID = '11111111-1111-1111-1111-111111111111';
const CLASS_ID = '22222222-2222-2222-2222-222222222222';
const NOW = new Date('2026-05-12T20:00:00Z');

describe('TacticalReportsService', () => {
  let service: TacticalReportsService;
  let prisma: {
    unit: { findUnique: ReturnType<typeof vi.fn> };
    class: { findUnique: ReturnType<typeof vi.fn> };
  };

  beforeEach(async () => {
    prisma = {
      unit: { findUnique: vi.fn() },
      class: { findUnique: vi.fn() },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [TacticalReportsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(TacticalReportsService);
  });

  afterEach(() => vi.restoreAllMocks());

  describe('getUnitReport', () => {
    it('throws NotFound when unit missing', async () => {
      prisma.unit.findUnique.mockResolvedValueOnce(null);
      await expect(service.getUnitReport(UNIT_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('aggregates counts and breakdowns across classes and their exercises', async () => {
      prisma.unit.findUnique.mockResolvedValueOnce({
        id: UNIT_ID,
        name: 'Unit A',
        abbreviation: 'UA',
        instructors: [
          {
            unitId: UNIT_ID,
            userId: 'u1',
            assignedAt: NOW,
            user: { id: 'u1', displayName: 'Inst 1', email: 'i1@o.test' },
          },
        ],
        classes: [
          {
            id: 'c1',
            name: 'Class A',
            status: ClassStatus.ACTIVE,
            startsAt: NOW,
            endsAt: null,
            leadInstructor: { displayName: 'L1' },
            exercises: [
              { id: 'e1', status: ExerciseStatus.COMPLETED },
              { id: 'e2', status: ExerciseStatus.RUNNING },
            ],
          },
          {
            id: 'c2',
            name: 'Class B',
            status: ClassStatus.COMPLETED,
            startsAt: NOW,
            endsAt: NOW,
            leadInstructor: { displayName: 'L2' },
            exercises: [{ id: 'e3', status: ExerciseStatus.COMPLETED }],
          },
        ],
      });

      const report = await service.getUnitReport(UNIT_ID);

      expect(report.meta).toMatchObject({ id: UNIT_ID, name: 'Unit A', abbreviation: 'UA' });
      expect(report.summary).toMatchObject({
        instructorCount: 1,
        classCount: 2,
        exerciseCount: 3,
        classesByStatus: { PLANNED: 0, ACTIVE: 1, COMPLETED: 1, CANCELLED: 0 },
        exercisesByStatus: { PLANNED: 0, RUNNING: 1, COMPLETED: 2, CANCELLED: 0 },
      });
      expect(report.classes).toHaveLength(2);
      expect(report.classes[0]).toMatchObject({ id: 'c1', exerciseCount: 2 });
      expect(report.instructors[0].displayName).toBe('Inst 1');
    });

    it('renders zero breakdown buckets for an empty unit', async () => {
      prisma.unit.findUnique.mockResolvedValueOnce({
        id: UNIT_ID,
        name: 'Empty',
        abbreviation: null,
        instructors: [],
        classes: [],
      });
      const report = await service.getUnitReport(UNIT_ID);
      expect(report.summary.classesByStatus).toEqual({
        PLANNED: 0,
        ACTIVE: 0,
        COMPLETED: 0,
        CANCELLED: 0,
      });
      expect(report.classes).toEqual([]);
    });
  });

  describe('getClassReport', () => {
    it('throws NotFound when class missing', async () => {
      prisma.class.findUnique.mockResolvedValueOnce(null);
      await expect(service.getClassReport(CLASS_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('completionRate is 0 when there are no exercises (avoids NaN)', async () => {
      prisma.class.findUnique.mockResolvedValueOnce({
        id: CLASS_ID,
        name: 'C',
        status: ClassStatus.PLANNED,
        startsAt: NOW,
        endsAt: null,
        unitId: UNIT_ID,
        unit: { name: 'U' },
        leadInstructorId: 'u',
        leadInstructor: { displayName: 'L', email: 'l@o.test' },
        exercises: [],
      });
      const report = await service.getClassReport(CLASS_ID);
      expect(report.summary.completionRate).toBe(0);
      expect(report.summary.exerciseCount).toBe(0);
    });

    it('completionRate = completed/total clamped to [0,1]', async () => {
      prisma.class.findUnique.mockResolvedValueOnce({
        id: CLASS_ID,
        name: 'C',
        status: ClassStatus.ACTIVE,
        startsAt: NOW,
        endsAt: null,
        unitId: UNIT_ID,
        unit: { name: 'U' },
        leadInstructorId: 'u',
        leadInstructor: { displayName: 'L', email: 'l@o.test' },
        exercises: [
          {
            id: 'a',
            name: 'A',
            description: null,
            status: ExerciseStatus.COMPLETED,
            scheduledAt: null,
            eventId: null,
          },
          {
            id: 'b',
            name: 'B',
            description: 'desc',
            status: ExerciseStatus.COMPLETED,
            scheduledAt: NOW,
            eventId: null,
          },
          {
            id: 'c',
            name: 'C',
            description: null,
            status: ExerciseStatus.PLANNED,
            scheduledAt: null,
            eventId: null,
          },
          {
            id: 'd',
            name: 'D',
            description: null,
            status: ExerciseStatus.RUNNING,
            scheduledAt: null,
            eventId: null,
          },
        ],
      });
      const report = await service.getClassReport(CLASS_ID);
      expect(report.summary.exerciseCount).toBe(4);
      expect(report.summary.completionRate).toBe(0.5); // 2/4
      expect(report.exercises).toHaveLength(4);
    });
  });
});
