import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ClassesController } from './classes.controller';
import { ExercisesController } from './exercises.controller';
import { InstructorsController } from './instructors.controller';
import { TacticalService } from './tactical.service';
import { UnitsController } from './units.controller';

const ADMIN_USER = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'a@o.test',
  displayName: 'Adm',
  role: Role.ADMIN,
};
const UNIT_ID = '22222222-2222-2222-2222-222222222222';
const CLASS_ID = '33333333-3333-3333-3333-333333333333';
const USER_ID = '44444444-4444-4444-4444-444444444444';

async function buildModule(controller: unknown, service: unknown) {
  const moduleRef = await Test.createTestingModule({
    controllers: [controller as never],
    providers: [{ provide: TacticalService, useValue: service }],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(RolesGuard)
    .useValue({ canActivate: () => true })
    .compile();
  return moduleRef;
}

describe('UnitsController', () => {
  let controller: UnitsController;
  let service: { createUnit: ReturnType<typeof vi.fn>; getUnit: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    service = { createUnit: vi.fn().mockResolvedValue({}), getUnit: vi.fn().mockResolvedValue({}) };
    controller = (await buildModule(UnitsController, service)).get(UnitsController);
  });

  afterEach(() => vi.restoreAllMocks());

  it('forwards parsed body to createUnit', async () => {
    await controller.create({ name: 'My Unit' });
    expect(service.createUnit).toHaveBeenCalledWith({ name: 'My Unit' });
  });

  it('rejects too-short name (1 char) with 400', async () => {
    await expect(controller.create({ name: 'A' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects non-uuid id on GET :id', async () => {
    await expect(controller.getById({ id: 'not-a-uuid' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('InstructorsController', () => {
  let controller: InstructorsController;
  let service: {
    assignInstructor: ReturnType<typeof vi.fn>;
    listUnitInstructors: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    service = {
      assignInstructor: vi.fn().mockResolvedValue({}),
      listUnitInstructors: vi.fn().mockResolvedValue([]),
    };
    controller = (await buildModule(InstructorsController, service)).get(InstructorsController);
  });

  afterEach(() => vi.restoreAllMocks());

  it('forwards unitId and parsed body to assignInstructor', async () => {
    await controller.assign({ unitId: UNIT_ID }, { userId: USER_ID });
    expect(service.assignInstructor).toHaveBeenCalledWith(UNIT_ID, { userId: USER_ID });
  });

  it('rejects non-uuid userId in body', async () => {
    await expect(controller.assign({ unitId: UNIT_ID }, { userId: 'x' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('ClassesController', () => {
  let controller: ClassesController;
  let service: {
    createClass: ReturnType<typeof vi.fn>;
    listClassesByUnit: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    service = {
      createClass: vi.fn().mockResolvedValue({}),
      listClassesByUnit: vi.fn().mockResolvedValue([]),
    };
    controller = (await buildModule(ClassesController, service)).get(ClassesController);
  });

  afterEach(() => vi.restoreAllMocks());

  it('forwards user + unitId + parsed body to createClass', async () => {
    const body = {
      name: 'T-1',
      leadInstructorId: USER_ID,
      startsAt: '2026-05-12T20:00:00.000Z',
    };
    await controller.create(ADMIN_USER, { unitId: UNIT_ID }, body);
    expect(service.createClass).toHaveBeenCalledWith(ADMIN_USER, UNIT_ID, body);
  });

  it('rejects body without leadInstructorId', async () => {
    await expect(
      controller.create(ADMIN_USER, { unitId: UNIT_ID }, { name: 'T', startsAt: 'bad' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects update body with no fields (refine guard)', async () => {
    await expect(controller.update(ADMIN_USER, { id: CLASS_ID }, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('ExercisesController', () => {
  let controller: ExercisesController;
  let service: { createExercise: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    service = { createExercise: vi.fn().mockResolvedValue({}) };
    controller = (await buildModule(ExercisesController, service)).get(ExercisesController);
  });

  afterEach(() => vi.restoreAllMocks());

  it('forwards user + classId + parsed body to createExercise', async () => {
    await controller.create(
      ADMIN_USER,
      { classId: CLASS_ID },
      { name: 'Drill', description: 'opt' },
    );
    expect(service.createExercise).toHaveBeenCalledWith(ADMIN_USER, CLASS_ID, {
      name: 'Drill',
      description: 'opt',
    });
  });

  it('rejects body with non-uuid eventId', async () => {
    await expect(
      controller.create(ADMIN_USER, { classId: CLASS_ID }, { name: 'Drill', eventId: 'not-uuid' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
