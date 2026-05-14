import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

const EVENT_ID = '11111111-1111-1111-1111-111111111111';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let service: {
    getOperatorsByEvent: ReturnType<typeof vi.fn>;
    getSquadsByEvent: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    service = {
      getOperatorsByEvent: vi.fn().mockResolvedValue([]),
      getSquadsByEvent: vi.fn().mockResolvedValue([]),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [{ provide: AnalyticsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(AnalyticsController);
  });

  afterEach(() => vi.restoreAllMocks());

  describe('operators', () => {
    it('forwards the eventId to the service', async () => {
      await controller.operators({ eventId: EVENT_ID });
      expect(service.getOperatorsByEvent).toHaveBeenCalledWith(EVENT_ID);
    });

    it('rejects non-uuid eventId', async () => {
      await expect(controller.operators({ eventId: 'not-a-uuid' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('returns service output as-is', async () => {
      const view = [{ operatorId: 'x', callsign: 'X' }];
      service.getOperatorsByEvent.mockResolvedValueOnce(view);
      expect(await controller.operators({ eventId: EVENT_ID })).toBe(view);
    });
  });

  describe('squads', () => {
    it('forwards the eventId to the service', async () => {
      await controller.squads({ eventId: EVENT_ID });
      expect(service.getSquadsByEvent).toHaveBeenCalledWith(EVENT_ID);
    });

    it('rejects non-uuid eventId', async () => {
      await expect(controller.squads({ eventId: 'not-a-uuid' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
