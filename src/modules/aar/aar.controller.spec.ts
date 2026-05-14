import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AarController } from './aar.controller';
import { AarService } from './aar.service';

const EVENT_ID = '11111111-1111-1111-1111-111111111111';
const OP_ID = '22222222-2222-2222-2222-222222222222';

describe('AarController', () => {
  let controller: AarController;
  let service: {
    getTimeline: ReturnType<typeof vi.fn>;
    getPositions: ReturnType<typeof vi.fn>;
    exportEvent: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    service = {
      getTimeline: vi.fn().mockResolvedValue([]),
      getPositions: vi.fn().mockResolvedValue({ rows: [], nextCursor: null }),
      exportEvent: vi.fn().mockResolvedValue({}),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AarController],
      providers: [{ provide: AarService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(AarController);
  });

  afterEach(() => vi.restoreAllMocks());

  describe('timeline', () => {
    it('defaults limit=200 and passes nulls for unused filters', async () => {
      await controller.timeline({ eventId: EVENT_ID }, {});
      expect(service.getTimeline).toHaveBeenCalledWith(EVENT_ID, {
        fromAt: null,
        toAt: null,
        limit: 200,
      });
    });

    it('forwards parsed limit + range', async () => {
      await controller.timeline(
        { eventId: EVENT_ID },
        { fromAt: '2026-05-12T20:00:00Z', toAt: '2026-05-12T21:00:00Z', limit: '50' },
      );
      expect(service.getTimeline).toHaveBeenCalledWith(EVENT_ID, {
        fromAt: '2026-05-12T20:00:00Z',
        toAt: '2026-05-12T21:00:00Z',
        limit: 50,
      });
    });

    it('rejects non-uuid eventId', async () => {
      await expect(controller.timeline({ eventId: 'not-uuid' }, {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects limit above max', async () => {
      await expect(
        controller.timeline({ eventId: EVENT_ID }, { limit: '5000' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('positions', () => {
    it('defaults limit=500 and nulls for unused filters', async () => {
      await controller.positions({ eventId: EVENT_ID }, {});
      expect(service.getPositions).toHaveBeenCalledWith(EVENT_ID, {
        operatorId: null,
        fromAt: null,
        toAt: null,
        cursor: null,
        limit: 500,
      });
    });

    it('forwards cursor + operator filter', async () => {
      await controller.positions(
        { eventId: EVENT_ID },
        {
          operatorId: OP_ID,
          cursor: '2026-05-12T20:00:00.000Z',
          limit: '50',
        },
      );
      expect(service.getPositions).toHaveBeenCalledWith(EVENT_ID, {
        operatorId: OP_ID,
        fromAt: null,
        toAt: null,
        cursor: '2026-05-12T20:00:00.000Z',
        limit: 50,
      });
    });

    it('rejects operatorId not-uuid', async () => {
      await expect(
        controller.positions({ eventId: EVENT_ID }, { operatorId: 'nope' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('export', () => {
    it('defaults includeTimeline=true', async () => {
      await controller.export({ eventId: EVENT_ID }, {});
      expect(service.exportEvent).toHaveBeenCalledWith(EVENT_ID, { includeTimeline: true });
    });

    it('parses includeTimeline=false from query string', async () => {
      await controller.export({ eventId: EVENT_ID }, { includeTimeline: 'false' });
      expect(service.exportEvent).toHaveBeenCalledWith(EVENT_ID, { includeTimeline: false });
    });
  });
});
