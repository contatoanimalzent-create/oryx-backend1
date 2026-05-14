import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SquadStatus } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SquadsController } from './squads.controller';
import { SquadsService } from './squads.service';

const TEAM_ID = '11111111-1111-1111-1111-111111111111';
const SQUAD_ID = '22222222-2222-2222-2222-222222222222';
const OPERATOR_ID = '33333333-3333-3333-3333-333333333333';

const VIEW = {
  id: SQUAD_ID,
  teamId: TEAM_ID,
  name: 'Alpha',
  description: null,
  leaderId: null,
  status: SquadStatus.ACTIVE,
  createdAt: '2026-05-03T22:00:00.000Z',
  updatedAt: '2026-05-03T22:00:00.000Z',
  members: [],
};

describe('SquadsController', () => {
  let controller: SquadsController;
  let service: {
    createForTeam: ReturnType<typeof vi.fn>;
    listByTeam: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    addMember: ReturnType<typeof vi.fn>;
    removeMember: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    service = {
      createForTeam: vi.fn(),
      listByTeam: vi.fn(),
      getById: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      addMember: vi.fn(),
      removeMember: vi.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [SquadsController],
      providers: [{ provide: SquadsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(SquadsController);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /teams/:teamId/squads', () => {
    it('rejects non-UUID teamId', async () => {
      await expect(controller.create({ teamId: 'no' }, { name: 'Alpha' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects too-short name', async () => {
      await expect(controller.create({ teamId: TEAM_ID }, { name: 'A' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('forwards parsed body and teamId', async () => {
      service.createForTeam.mockResolvedValue(VIEW);
      await controller.create({ teamId: TEAM_ID }, { name: 'Alpha', description: 'sniper team' });
      expect(service.createForTeam).toHaveBeenCalledWith(TEAM_ID, {
        name: 'Alpha',
        description: 'sniper team',
      });
    });
  });

  describe('GET /teams/:teamId/squads', () => {
    it('forwards parsed teamId', async () => {
      service.listByTeam.mockResolvedValue([VIEW]);
      await controller.listByTeam({ teamId: TEAM_ID });
      expect(service.listByTeam).toHaveBeenCalledWith(TEAM_ID);
    });
  });

  describe('GET /squads/:id', () => {
    it('forwards parsed id', async () => {
      service.getById.mockResolvedValue(VIEW);
      await controller.getById({ id: SQUAD_ID });
      expect(service.getById).toHaveBeenCalledWith(SQUAD_ID);
    });
  });

  describe('PATCH /squads/:id', () => {
    it('rejects empty body', async () => {
      await expect(controller.update({ id: SQUAD_ID }, {})).rejects.toThrow(BadRequestException);
    });

    it('rejects unknown status enum', async () => {
      await expect(controller.update({ id: SQUAD_ID }, { status: 'WRONG' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects non-UUID leaderId', async () => {
      await expect(controller.update({ id: SQUAD_ID }, { leaderId: 'no' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('forwards parsed partial', async () => {
      service.update.mockResolvedValue(VIEW);
      await controller.update({ id: SQUAD_ID }, { status: SquadStatus.INACTIVE });
      expect(service.update).toHaveBeenCalledWith(SQUAD_ID, { status: SquadStatus.INACTIVE });
    });
  });

  describe('DELETE /squads/:id', () => {
    it('forwards parsed id', async () => {
      service.remove.mockResolvedValue(undefined);
      await controller.remove({ id: SQUAD_ID });
      expect(service.remove).toHaveBeenCalledWith(SQUAD_ID);
    });
  });

  describe('POST /squads/:id/members', () => {
    it('rejects non-UUID operatorId', async () => {
      await expect(controller.addMember({ id: SQUAD_ID }, { operatorId: 'no' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('forwards parsed body', async () => {
      service.addMember.mockResolvedValue(VIEW);
      await controller.addMember({ id: SQUAD_ID }, { operatorId: OPERATOR_ID });
      expect(service.addMember).toHaveBeenCalledWith(SQUAD_ID, { operatorId: OPERATOR_ID });
    });
  });

  describe('DELETE /squads/:id/members/:operatorId', () => {
    it('rejects non-UUID operatorId in path', async () => {
      await expect(controller.removeMember({ id: SQUAD_ID, operatorId: 'no' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('forwards parsed ids', async () => {
      service.removeMember.mockResolvedValue(undefined);
      await controller.removeMember({ id: SQUAD_ID, operatorId: OPERATOR_ID });
      expect(service.removeMember).toHaveBeenCalledWith(SQUAD_ID, OPERATOR_ID);
    });
  });
});
