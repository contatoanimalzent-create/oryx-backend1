import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RoundStatus } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CompetitiveController } from './competitive.controller';
import { CompetitiveService } from './competitive.service';

const EVENT_ID = '11111111-1111-1111-1111-111111111111';
const ROUND_ID = '22222222-2222-2222-2222-222222222222';
const OP_ID = '33333333-3333-3333-3333-333333333333';
const ELIM_ID = '44444444-4444-4444-4444-444444444444';

describe('CompetitiveController', () => {
  let controller: CompetitiveController;
  let service: {
    createRound: ReturnType<typeof vi.fn>;
    listRoundsByEvent: ReturnType<typeof vi.fn>;
    getRound: ReturnType<typeof vi.fn>;
    updateRound: ReturnType<typeof vi.fn>;
    recordElimination: ReturnType<typeof vi.fn>;
    listEliminationsByRound: ReturnType<typeof vi.fn>;
    deleteElimination: ReturnType<typeof vi.fn>;
    getScoreboard: ReturnType<typeof vi.fn>;
    getMvp: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    service = {
      createRound: vi.fn().mockResolvedValue({}),
      listRoundsByEvent: vi.fn().mockResolvedValue([]),
      getRound: vi.fn().mockResolvedValue({}),
      updateRound: vi.fn().mockResolvedValue({}),
      recordElimination: vi.fn().mockResolvedValue({}),
      listEliminationsByRound: vi.fn().mockResolvedValue([]),
      deleteElimination: vi.fn().mockResolvedValue(undefined),
      getScoreboard: vi.fn().mockResolvedValue({}),
      getMvp: vi.fn().mockResolvedValue({}),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [CompetitiveController],
      providers: [{ provide: CompetitiveService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(CompetitiveController);
  });

  afterEach(() => vi.restoreAllMocks());

  describe('rounds', () => {
    it('forwards eventId + parsed body to startRound', async () => {
      await controller.startRound({ eventId: EVENT_ID }, { note: 'opening' });
      expect(service.createRound).toHaveBeenCalledWith(EVENT_ID, { note: 'opening' });
    });

    it('rejects non-uuid eventId', async () => {
      await expect(controller.startRound({ eventId: 'nope' }, {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('patchRound forwards parsed body', async () => {
      await controller.patchRound(
        { id: ROUND_ID },
        { status: RoundStatus.COMPLETED, winningTeamId: null },
      );
      expect(service.updateRound).toHaveBeenCalledWith(ROUND_ID, {
        status: RoundStatus.COMPLETED,
        winningTeamId: null,
      });
    });

    it('rejects update body with no fields (refine)', async () => {
      await expect(controller.patchRound({ id: ROUND_ID }, {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('eliminations', () => {
    it('forwards roundId + parsed body', async () => {
      await controller.recordElimination(
        { id: ROUND_ID },
        { eliminatedOperatorId: OP_ID, note: 'objective area' },
      );
      expect(service.recordElimination).toHaveBeenCalledWith(ROUND_ID, {
        eliminatedOperatorId: OP_ID,
        note: 'objective area',
      });
    });

    it('rejects body without eliminatedOperatorId', async () => {
      await expect(controller.recordElimination({ id: ROUND_ID }, {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('delete forwards elimination id', async () => {
      await controller.deleteElimination({ id: ELIM_ID });
      expect(service.deleteElimination).toHaveBeenCalledWith(ELIM_ID);
    });

    it('rejects non-uuid elimination id', async () => {
      await expect(controller.deleteElimination({ id: 'nope' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('scoreboard + mvp', () => {
    it('forwards eventId to scoreboard', async () => {
      await controller.scoreboard({ eventId: EVENT_ID });
      expect(service.getScoreboard).toHaveBeenCalledWith(EVENT_ID);
    });

    it('forwards eventId to mvp', async () => {
      await controller.mvp({ eventId: EVENT_ID });
      expect(service.getMvp).toHaveBeenCalledWith(EVENT_ID);
    });
  });
});
