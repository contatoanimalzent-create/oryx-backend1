import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ReputationKind, ReputationReason, ReputationSeverity, Role } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../auth/dto/auth.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ReputationController } from './reputation.controller';
import { ReputationService } from './reputation.service';

const OP_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ID = '22222222-2222-2222-2222-222222222222';
const EVENT_ID = '33333333-3333-3333-3333-333333333333';

const ADMIN: AuthenticatedUser = {
  id: ADMIN_ID,
  email: 'admin@oryx.test',
  displayName: 'Admin',
  role: Role.ADMIN,
};

describe('ReputationController', () => {
  let controller: ReputationController;
  let service: {
    recordEntry: ReturnType<typeof vi.fn>;
    getOperatorReputation: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    service = {
      recordEntry: vi.fn().mockResolvedValue({ id: 'log-1' }),
      getOperatorReputation: vi
        .fn()
        .mockResolvedValue({ operatorId: OP_ID, score: 100, history: [] }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ReputationController],
      providers: [{ provide: ReputationService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(ReputationController);
  });

  afterEach(() => vi.restoreAllMocks());

  describe('record', () => {
    it('forwards admin id, operatorId and parsed body to service', async () => {
      await controller.record(
        ADMIN,
        { operatorId: OP_ID },
        {
          kind: ReputationKind.PENALTY,
          severity: ReputationSeverity.MAJOR,
          reason: ReputationReason.AFK,
          eventId: EVENT_ID,
          note: 'mid-match disconnect',
        },
      );
      expect(service.recordEntry).toHaveBeenCalledWith(
        OP_ID,
        {
          kind: ReputationKind.PENALTY,
          severity: ReputationSeverity.MAJOR,
          reason: ReputationReason.AFK,
          eventId: EVENT_ID,
          note: 'mid-match disconnect',
        },
        ADMIN_ID,
      );
    });

    it('rejects non-uuid operatorId', async () => {
      await expect(
        controller.record(
          ADMIN,
          { operatorId: 'nope' },
          {
            kind: ReputationKind.PENALTY,
            severity: ReputationSeverity.MINOR,
            reason: ReputationReason.OTHER,
          },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects unknown kind', async () => {
      await expect(
        controller.record(
          ADMIN,
          { operatorId: OP_ID },
          {
            kind: 'BANANA',
            severity: ReputationSeverity.MINOR,
            reason: ReputationReason.OTHER,
          },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects note above max length', async () => {
      await expect(
        controller.record(
          ADMIN,
          { operatorId: OP_ID },
          {
            kind: ReputationKind.PENALTY,
            severity: ReputationSeverity.MINOR,
            reason: ReputationReason.OTHER,
            note: 'x'.repeat(1001),
          },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('get', () => {
    it('forwards operatorId to service', async () => {
      const out = await controller.get({ operatorId: OP_ID });
      expect(service.getOperatorReputation).toHaveBeenCalledWith(OP_ID);
      expect(out).toEqual({ operatorId: OP_ID, score: 100, history: [] });
    });

    it('rejects non-uuid operatorId', async () => {
      await expect(controller.get({ operatorId: 'bad' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
