import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RankingController } from './ranking.controller';
import { RankingService } from './ranking.service';

const EVENT_ID = '11111111-1111-1111-1111-111111111111';

describe('RankingController', () => {
  let controller: RankingController;
  let service: {
    getOperatorsByEvent: ReturnType<typeof vi.fn>;
    getSquadsByEvent: ReturnType<typeof vi.fn>;
    getTeamsByEvent: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    service = {
      getOperatorsByEvent: vi.fn().mockResolvedValue([]),
      getSquadsByEvent: vi.fn().mockResolvedValue([]),
      getTeamsByEvent: vi.fn().mockResolvedValue([]),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [RankingController],
      providers: [{ provide: RankingService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(RankingController);
  });

  afterEach(() => vi.restoreAllMocks());

  describe('operators', () => {
    it('parses limit and forwards to service', async () => {
      await controller.operators({ eventId: EVENT_ID }, { limit: '25' });
      expect(service.getOperatorsByEvent).toHaveBeenCalledWith(EVENT_ID, { limit: 25 });
    });

    it('defaults to limit=50 when no query supplied', async () => {
      await controller.operators({ eventId: EVENT_ID }, undefined);
      expect(service.getOperatorsByEvent).toHaveBeenCalledWith(EVENT_ID, { limit: 50 });
    });

    it('rejects non-uuid eventId', async () => {
      await expect(controller.operators({ eventId: 'not-a-uuid' }, {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects limit above max', async () => {
      await expect(
        controller.operators({ eventId: EVENT_ID }, { limit: '500' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects negative limit', async () => {
      await expect(
        controller.operators({ eventId: EVENT_ID }, { limit: '-5' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('squads', () => {
    it('forwards uuid + parsed limit', async () => {
      await controller.squads({ eventId: EVENT_ID }, { limit: '10' });
      expect(service.getSquadsByEvent).toHaveBeenCalledWith(EVENT_ID, { limit: 10 });
    });
  });

  describe('teams', () => {
    it('forwards uuid + parsed limit', async () => {
      await controller.teams({ eventId: EVENT_ID }, { limit: '10' });
      expect(service.getTeamsByEvent).toHaveBeenCalledWith(EVENT_ID, { limit: 10 });
    });
  });
});
