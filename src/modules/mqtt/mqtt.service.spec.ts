import { ConflictException, NotFoundException, NotImplementedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventStatus, SquadStatus } from '@prisma/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../../shared/database/prisma.service';

const TEST_ENV = {
  NODE_ENV: 'test',
  PORT: '3000',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://x:x@localhost:5432/x',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL: '30d',
  MQTT_MODE: 'stub',
  MQTT_CREDENTIAL_TTL_SECONDS: '3600',
  AWS_REGION: 'sa-east-1',
};

const USER_ID = '11111111-1111-1111-1111-111111111111';
const OPERATOR_ID = '22222222-2222-2222-2222-222222222222';
const EVENT_ID = '33333333-3333-3333-3333-333333333333';

describe('MqttService', () => {
  let prisma: {
    operator: { findUnique: ReturnType<typeof vi.fn> };
    squadMember: { findFirst: ReturnType<typeof vi.fn> };
  };

  beforeAll(() => {
    Object.assign(process.env, TEST_ENV);
  });

  beforeEach(() => {
    prisma = {
      operator: { findUnique: vi.fn() },
      squadMember: { findFirst: vi.fn() },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function makeService(): Promise<{ issueForUser: (u: string) => Promise<unknown> }> {
    const { MqttService } = await import('./mqtt.service');
    const moduleRef = await Test.createTestingModule({
      providers: [MqttService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    return moduleRef.get(MqttService);
  }

  describe('stub mode', () => {
    it('issues a stub URL when all preconditions hold', async () => {
      prisma.operator.findUnique.mockResolvedValue({ id: OPERATOR_ID, userId: USER_ID });
      prisma.squadMember.findFirst.mockResolvedValue({
        squad: {
          status: SquadStatus.ACTIVE,
          team: { event: { id: EVENT_ID, status: EventStatus.ACTIVE } },
        },
      });

      const svc = await makeService();
      const result = (await svc.issueForUser(USER_ID)) as {
        url: string;
        clientId: string;
        topicPrefix: string;
        expiresAt: string;
        mode: string;
      };

      expect(result.mode).toBe('stub');
      expect(result.clientId).toBe(OPERATOR_ID);
      expect(result.topicPrefix).toBe(`oryx/positions/${EVENT_ID}/${OPERATOR_ID}`);
      expect(result.url).toMatch(/^wss:\/\/iot\.stub\.local\/mqtt\?/);
      expect(result.url).toContain(`clientId=${OPERATOR_ID}`);
      expect(result.url).toContain('X-Amz-Signature=');
      expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('rejects when user has no operator profile', async () => {
      prisma.operator.findUnique.mockResolvedValue(null);
      const svc = await makeService();
      await expect(svc.issueForUser(USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('rejects when operator has no squad membership', async () => {
      prisma.operator.findUnique.mockResolvedValue({ id: OPERATOR_ID, userId: USER_ID });
      prisma.squadMember.findFirst.mockResolvedValue(null);
      const svc = await makeService();
      await expect(svc.issueForUser(USER_ID)).rejects.toThrow(ConflictException);
    });

    it('rejects when squad is INACTIVE', async () => {
      prisma.operator.findUnique.mockResolvedValue({ id: OPERATOR_ID, userId: USER_ID });
      prisma.squadMember.findFirst.mockResolvedValue({
        squad: {
          status: SquadStatus.INACTIVE,
          team: { event: { id: EVENT_ID, status: EventStatus.ACTIVE } },
        },
      });
      const svc = await makeService();
      await expect(svc.issueForUser(USER_ID)).rejects.toThrow(/INACTIVE/);
    });

    it('rejects when squad is DISBANDED', async () => {
      prisma.operator.findUnique.mockResolvedValue({ id: OPERATOR_ID, userId: USER_ID });
      prisma.squadMember.findFirst.mockResolvedValue({
        squad: {
          status: SquadStatus.DISBANDED,
          team: { event: { id: EVENT_ID, status: EventStatus.ACTIVE } },
        },
      });
      const svc = await makeService();
      await expect(svc.issueForUser(USER_ID)).rejects.toThrow(/DISBANDED/);
    });

    it('rejects when event is DRAFT', async () => {
      prisma.operator.findUnique.mockResolvedValue({ id: OPERATOR_ID, userId: USER_ID });
      prisma.squadMember.findFirst.mockResolvedValue({
        squad: {
          status: SquadStatus.ACTIVE,
          team: { event: { id: EVENT_ID, status: EventStatus.DRAFT } },
        },
      });
      const svc = await makeService();
      await expect(svc.issueForUser(USER_ID)).rejects.toThrow(/DRAFT/);
    });

    it('rejects when event is ENDED', async () => {
      prisma.operator.findUnique.mockResolvedValue({ id: OPERATOR_ID, userId: USER_ID });
      prisma.squadMember.findFirst.mockResolvedValue({
        squad: {
          status: SquadStatus.ACTIVE,
          team: { event: { id: EVENT_ID, status: EventStatus.ENDED } },
        },
      });
      const svc = await makeService();
      await expect(svc.issueForUser(USER_ID)).rejects.toThrow(/ENDED/);
    });
  });

  describe('aws mode', () => {
    it('throws NotImplemented (501) until deploy session wires STS+SigV4', async () => {
      vi.resetModules();
      Object.assign(process.env, { ...TEST_ENV, MQTT_MODE: 'aws' });

      prisma.operator.findUnique.mockResolvedValue({ id: OPERATOR_ID, userId: USER_ID });
      prisma.squadMember.findFirst.mockResolvedValue({
        squad: {
          status: SquadStatus.ACTIVE,
          team: { event: { id: EVENT_ID, status: EventStatus.ACTIVE } },
        },
      });

      // After resetModules the PrismaService class identity changes, so the
      // testing module needs to be wired against the freshly imported token.
      const { MqttService } = await import('./mqtt.service');
      const { PrismaService: FreshPrismaService } =
        await import('../../shared/database/prisma.service');
      const moduleRef = await Test.createTestingModule({
        providers: [MqttService, { provide: FreshPrismaService, useValue: prisma }],
      }).compile();
      const svc = moduleRef.get(MqttService);

      await expect(svc.issueForUser(USER_ID)).rejects.toThrow(NotImplementedException);

      // Restore stub mode for the rest of the suite.
      Object.assign(process.env, TEST_ENV);
      vi.resetModules();
    });
  });
});
