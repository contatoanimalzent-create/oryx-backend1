import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BloodType, OperatorStatus } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OperatorsRepository } from './operators.repository';
import { OperatorsService } from './operators.service';

interface OperatorRow {
  id: string;
  userId: string;
  callsign: string;
  bio: string | null;
  emergencyContact: string | null;
  bloodType: BloodType;
  status: OperatorStatus;
  createdAt: Date;
  updatedAt: Date;
}

const baseOperator: OperatorRow = {
  id: '11111111-1111-1111-1111-111111111111',
  userId: 'user-1',
  callsign: 'GHOST',
  bio: null,
  emergencyContact: null,
  bloodType: BloodType.UNKNOWN,
  status: OperatorStatus.ACTIVE,
  createdAt: new Date('2026-05-03T18:00:00Z'),
  updatedAt: new Date('2026-05-03T18:00:00Z'),
};

describe('OperatorsService', () => {
  let service: OperatorsService;
  let repo: {
    findById: ReturnType<typeof vi.fn>;
    findByUserId: ReturnType<typeof vi.fn>;
    findByCallsign: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    updateById: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    repo = {
      findById: vi.fn(),
      findByUserId: vi.fn(),
      findByCallsign: vi.fn(),
      create: vi.fn(),
      updateById: vi.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [OperatorsService, { provide: OperatorsRepository, useValue: repo }],
    }).compile();
    service = moduleRef.get(OperatorsService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── createForUser ────────────────────────────────────────────────────────

  describe('createForUser', () => {
    it('creates a new operator profile', async () => {
      repo.findByUserId.mockResolvedValue(null);
      repo.findByCallsign.mockResolvedValue(null);
      repo.create.mockResolvedValue(baseOperator);

      const result = await service.createForUser('user-1', {
        callsign: 'GHOST',
        bio: 'sniper',
      });

      expect(result.callsign).toBe('GHOST');
      expect(result.bloodType).toBe(BloodType.UNKNOWN);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', callsign: 'GHOST', bio: 'sniper' }),
      );
    });

    it('rejects when user already has a profile', async () => {
      repo.findByUserId.mockResolvedValue(baseOperator);
      await expect(service.createForUser('user-1', { callsign: 'WHATEVER' })).rejects.toThrow(
        ConflictException,
      );
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('rejects when callsign is taken', async () => {
      repo.findByUserId.mockResolvedValue(null);
      repo.findByCallsign.mockResolvedValue({ ...baseOperator, userId: 'someone-else' });
      await expect(service.createForUser('user-1', { callsign: 'GHOST' })).rejects.toThrow(
        ConflictException,
      );
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  // ─── getByUserId / getById ────────────────────────────────────────────────

  describe('reads', () => {
    it('getByUserId returns view', async () => {
      repo.findByUserId.mockResolvedValue(baseOperator);
      const result = await service.getByUserId('user-1');
      expect(result.id).toBe(baseOperator.id);
      expect(result.createdAt).toBe(baseOperator.createdAt.toISOString());
    });

    it('getByUserId throws 404 when missing', async () => {
      repo.findByUserId.mockResolvedValue(null);
      await expect(service.getByUserId('user-1')).rejects.toThrow(NotFoundException);
    });

    it('getById throws 404 when missing', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.getById('00000000-0000-0000-0000-000000000000')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── updateForUser ────────────────────────────────────────────────────────

  describe('updateForUser', () => {
    it('updates only the provided fields', async () => {
      repo.findByUserId.mockResolvedValue(baseOperator);
      repo.updateById.mockResolvedValue({ ...baseOperator, bio: 'new bio' });

      const result = await service.updateForUser('user-1', { bio: 'new bio' });

      expect(result.bio).toBe('new bio');
      expect(repo.updateById).toHaveBeenCalledWith(baseOperator.id, { bio: 'new bio' });
    });

    it('skips callsign collision check when callsign is unchanged', async () => {
      repo.findByUserId.mockResolvedValue(baseOperator);
      repo.updateById.mockResolvedValue(baseOperator);

      await service.updateForUser('user-1', { callsign: 'GHOST' });

      expect(repo.findByCallsign).not.toHaveBeenCalled();
    });

    it('rejects when new callsign is taken by someone else', async () => {
      repo.findByUserId.mockResolvedValue(baseOperator);
      repo.findByCallsign.mockResolvedValue({ ...baseOperator, id: 'other', userId: 'other' });

      await expect(service.updateForUser('user-1', { callsign: 'TAKEN' })).rejects.toThrow(
        ConflictException,
      );
      expect(repo.updateById).not.toHaveBeenCalled();
    });

    it('throws 404 when user has no profile', async () => {
      repo.findByUserId.mockResolvedValue(null);
      await expect(service.updateForUser('user-1', { bio: 'x' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('accepts null to clear nullable fields', async () => {
      repo.findByUserId.mockResolvedValue({ ...baseOperator, bio: 'old' });
      repo.updateById.mockResolvedValue({ ...baseOperator, bio: null });

      await service.updateForUser('user-1', { bio: null });

      expect(repo.updateById).toHaveBeenCalledWith(baseOperator.id, { bio: null });
    });
  });
});
