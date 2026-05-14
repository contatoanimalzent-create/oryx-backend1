import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BloodType, OperatorStatus, Role } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OperatorsController } from './operators.controller';
import { OperatorsService } from './operators.service';

const USER = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'op@oryx.app',
  displayName: 'Op',
  role: Role.OPERATOR,
};

const VIEW = {
  id: '22222222-2222-2222-2222-222222222222',
  callsign: 'GHOST',
  bio: null,
  emergencyContact: null,
  bloodType: BloodType.UNKNOWN,
  status: OperatorStatus.ACTIVE,
  createdAt: '2026-05-03T18:00:00.000Z',
  updatedAt: '2026-05-03T18:00:00.000Z',
};

describe('OperatorsController', () => {
  let controller: OperatorsController;
  let service: {
    createForUser: ReturnType<typeof vi.fn>;
    getByUserId: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
    updateForUser: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    service = {
      createForUser: vi.fn(),
      getByUserId: vi.fn(),
      getById: vi.fn(),
      updateForUser: vi.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [OperatorsController],
      providers: [{ provide: OperatorsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(OperatorsController);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /operators', () => {
    it('rejects invalid callsign characters', async () => {
      await expect(controller.create(USER, { callsign: 'has space' })).rejects.toThrow(
        BadRequestException,
      );
      expect(service.createForUser).not.toHaveBeenCalled();
    });

    it('rejects callsign shorter than 2 chars', async () => {
      await expect(controller.create(USER, { callsign: 'a' })).rejects.toThrow(BadRequestException);
    });

    it('rejects extra/unknown fields silently passed through (zod strips)', async () => {
      service.createForUser.mockResolvedValue(VIEW);
      await controller.create(USER, {
        callsign: 'GHOST',
        userId: 'tampered',
        bloodType: BloodType.O_NEG,
      });
      const dto = service.createForUser.mock.calls[0][1] as Record<string, unknown>;
      expect(dto.userId).toBeUndefined();
      expect(dto.bloodType).toBe(BloodType.O_NEG);
    });

    it('forwards parsed body and current user id', async () => {
      service.createForUser.mockResolvedValue(VIEW);
      await controller.create(USER, { callsign: 'GHOST', bio: 'sniper' });
      expect(service.createForUser).toHaveBeenCalledWith(USER.id, {
        callsign: 'GHOST',
        bio: 'sniper',
      });
    });
  });

  describe('GET /operators/me', () => {
    it('delegates to service.getByUserId with current user id', async () => {
      service.getByUserId.mockResolvedValue(VIEW);
      await controller.getMe(USER);
      expect(service.getByUserId).toHaveBeenCalledWith(USER.id);
    });
  });

  describe('PATCH /operators/me', () => {
    it('rejects empty PATCH body', async () => {
      await expect(controller.updateMe(USER, {})).rejects.toThrow(BadRequestException);
    });

    it('forwards the parsed partial body', async () => {
      service.updateForUser.mockResolvedValue(VIEW);
      await controller.updateMe(USER, { status: OperatorStatus.INACTIVE });
      expect(service.updateForUser).toHaveBeenCalledWith(USER.id, {
        status: OperatorStatus.INACTIVE,
      });
    });
  });

  describe('GET /operators/:id', () => {
    it('rejects non-UUID id', async () => {
      await expect(controller.getById({ id: 'not-uuid' })).rejects.toThrow(BadRequestException);
    });

    it('forwards parsed UUID', async () => {
      service.getById.mockResolvedValue(VIEW);
      await controller.getById({ id: VIEW.id });
      expect(service.getById).toHaveBeenCalledWith(VIEW.id);
    });
  });
});
