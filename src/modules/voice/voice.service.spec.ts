import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventStatus, Role, SquadStatus } from '@prisma/client';
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
  VOICE_MODE: 'stub',
  VOICE_TOKEN_TTL_SECONDS: '3600',
};

const OPERATOR_USER_ID = '11111111-1111-1111-1111-111111111111';
const STAFF_USER_ID = '22222222-2222-2222-2222-222222222222';
const OPERATOR_ID = '33333333-3333-3333-3333-333333333333';
const SQUAD_ID = '44444444-4444-4444-4444-444444444444';
const TEAM_ID = '55555555-5555-5555-5555-555555555555';
const EVENT_ID = '66666666-6666-6666-6666-666666666666';

describe('VoiceService', () => {
  let prisma: {
    user: { findUnique: ReturnType<typeof vi.fn> };
    operator: { findUnique: ReturnType<typeof vi.fn> };
    squad: { findUnique: ReturnType<typeof vi.fn> };
    team: { findUnique: ReturnType<typeof vi.fn> };
    event: { findUnique: ReturnType<typeof vi.fn> };
    squadMember: {
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
    };
  };

  beforeAll(() => {
    Object.assign(process.env, TEST_ENV);
  });

  beforeEach(() => {
    prisma = {
      user: { findUnique: vi.fn() },
      operator: { findUnique: vi.fn() },
      squad: { findUnique: vi.fn() },
      team: { findUnique: vi.fn() },
      event: { findUnique: vi.fn() },
      squadMember: { findUnique: vi.fn(), findFirst: vi.fn() },
    };
  });

  afterEach(() => vi.restoreAllMocks());

  async function makeService(): Promise<{
    issueToken: (
      userId: string,
      dto: { channel: 'SQUAD' | 'TEAM' | 'COMMAND'; channelId: string },
    ) => Promise<{
      url: string;
      token: string;
      identity: string;
      room: string;
      canPublish: boolean;
      canSubscribe: boolean;
      expiresAt: string;
      mode: string;
    }>;
  }> {
    const { VoiceService } = await import('./voice.service');
    const moduleRef = await Test.createTestingModule({
      providers: [VoiceService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    return moduleRef.get(VoiceService);
  }

  // ─── SQUAD ───────────────────────────────────────────────────────────

  describe('SQUAD channel', () => {
    function mockActiveSquadAndEvent(): void {
      prisma.squad.findUnique.mockResolvedValue({
        id: SQUAD_ID,
        status: SquadStatus.ACTIVE,
        team: { event: { id: EVENT_ID, status: EventStatus.ACTIVE } },
      });
    }

    it('grants publish+subscribe to a member operator', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: OPERATOR_USER_ID,
        displayName: 'OpA',
        role: Role.OPERATOR,
      });
      mockActiveSquadAndEvent();
      prisma.operator.findUnique.mockResolvedValue({ id: OPERATOR_ID, callsign: 'ALPHA-1' });
      prisma.squadMember.findUnique.mockResolvedValue({
        squadId: SQUAD_ID,
        operatorId: OPERATOR_ID,
      });

      const svc = await makeService();
      const r = await svc.issueToken(OPERATOR_USER_ID, { channel: 'SQUAD', channelId: SQUAD_ID });

      expect(r.canPublish).toBe(true);
      expect(r.canSubscribe).toBe(true);
      expect(r.identity).toBe('operator:ALPHA-1');
      expect(r.room).toBe(`squad:${SQUAD_ID}`);
      expect(r.mode).toBe('stub');
      // JWT-shape: 3 dot-separated parts.
      expect(r.token.split('.').length).toBe(3);
    });

    it('grants subscribe-only to ADMIN observing a squad', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: STAFF_USER_ID,
        displayName: 'AdminX',
        role: Role.ADMIN,
      });
      mockActiveSquadAndEvent();
      prisma.operator.findUnique.mockResolvedValue(null);

      const svc = await makeService();
      const r = await svc.issueToken(STAFF_USER_ID, { channel: 'SQUAD', channelId: SQUAD_ID });

      expect(r.canPublish).toBe(false);
      expect(r.canSubscribe).toBe(true);
      expect(r.identity).toBe('staff:AdminX');
    });

    it('grants subscribe-only to INSTRUCTOR observing a squad', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: STAFF_USER_ID,
        displayName: 'Inst',
        role: Role.INSTRUCTOR,
      });
      mockActiveSquadAndEvent();
      prisma.operator.findUnique.mockResolvedValue(null);

      const svc = await makeService();
      const r = await svc.issueToken(STAFF_USER_ID, { channel: 'SQUAD', channelId: SQUAD_ID });

      expect(r.canPublish).toBe(false);
      expect(r.canSubscribe).toBe(true);
    });

    it('rejects a non-member operator with 403', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: OPERATOR_USER_ID,
        displayName: 'OpB',
        role: Role.OPERATOR,
      });
      mockActiveSquadAndEvent();
      prisma.operator.findUnique.mockResolvedValue({ id: OPERATOR_ID, callsign: 'BRAVO-2' });
      prisma.squadMember.findUnique.mockResolvedValue(null);

      const svc = await makeService();
      await expect(
        svc.issueToken(OPERATOR_USER_ID, { channel: 'SQUAD', channelId: SQUAD_ID }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects when squad does not exist (404)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: OPERATOR_USER_ID,
        displayName: 'OpC',
        role: Role.OPERATOR,
      });
      prisma.squad.findUnique.mockResolvedValue(null);

      const svc = await makeService();
      await expect(
        svc.issueToken(OPERATOR_USER_ID, { channel: 'SQUAD', channelId: SQUAD_ID }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects when squad is not ACTIVE', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: OPERATOR_USER_ID,
        displayName: 'OpD',
        role: Role.OPERATOR,
      });
      prisma.squad.findUnique.mockResolvedValue({
        id: SQUAD_ID,
        status: SquadStatus.INACTIVE,
        team: { event: { id: EVENT_ID, status: EventStatus.ACTIVE } },
      });

      const svc = await makeService();
      await expect(
        svc.issueToken(OPERATOR_USER_ID, { channel: 'SQUAD', channelId: SQUAD_ID }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects when underlying event is DRAFT/ENDED', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: OPERATOR_USER_ID,
        displayName: 'OpE',
        role: Role.OPERATOR,
      });
      prisma.squad.findUnique.mockResolvedValue({
        id: SQUAD_ID,
        status: SquadStatus.ACTIVE,
        team: { event: { id: EVENT_ID, status: EventStatus.DRAFT } },
      });

      const svc = await makeService();
      await expect(
        svc.issueToken(OPERATOR_USER_ID, { channel: 'SQUAD', channelId: SQUAD_ID }),
      ).rejects.toThrow(/DRAFT/);
    });
  });

  // ─── TEAM ────────────────────────────────────────────────────────────

  describe('TEAM channel', () => {
    function mockActiveTeam(): void {
      prisma.team.findUnique.mockResolvedValue({
        id: TEAM_ID,
        event: { id: EVENT_ID, status: EventStatus.ACTIVE },
      });
    }

    it('grants publish+subscribe to operator in any squad of the team', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: OPERATOR_USER_ID,
        displayName: 'OpA',
        role: Role.OPERATOR,
      });
      mockActiveTeam();
      prisma.operator.findUnique.mockResolvedValue({ id: OPERATOR_ID, callsign: 'CHARLIE-3' });
      prisma.squadMember.findFirst.mockResolvedValue({
        operatorId: OPERATOR_ID,
        squadId: SQUAD_ID,
      });

      const svc = await makeService();
      const r = await svc.issueToken(OPERATOR_USER_ID, { channel: 'TEAM', channelId: TEAM_ID });

      expect(r.canPublish).toBe(true);
      expect(r.identity).toBe('operator:CHARLIE-3');
      expect(r.room).toBe(`team:${TEAM_ID}`);
    });

    it('grants subscribe-only to admin observing a team', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: STAFF_USER_ID,
        displayName: 'AdmTeam',
        role: Role.ADMIN,
      });
      mockActiveTeam();
      prisma.operator.findUnique.mockResolvedValue(null);

      const svc = await makeService();
      const r = await svc.issueToken(STAFF_USER_ID, { channel: 'TEAM', channelId: TEAM_ID });
      expect(r.canPublish).toBe(false);
      expect(r.canSubscribe).toBe(true);
    });

    it('rejects operator not in any squad of the team', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: OPERATOR_USER_ID,
        displayName: 'OpZ',
        role: Role.OPERATOR,
      });
      mockActiveTeam();
      prisma.operator.findUnique.mockResolvedValue({ id: OPERATOR_ID, callsign: 'ZULU-9' });
      prisma.squadMember.findFirst.mockResolvedValue(null);

      const svc = await makeService();
      await expect(
        svc.issueToken(OPERATOR_USER_ID, { channel: 'TEAM', channelId: TEAM_ID }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects when team does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: OPERATOR_USER_ID,
        displayName: 'OpQ',
        role: Role.OPERATOR,
      });
      prisma.team.findUnique.mockResolvedValue(null);
      const svc = await makeService();
      await expect(
        svc.issueToken(OPERATOR_USER_ID, { channel: 'TEAM', channelId: TEAM_ID }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── COMMAND ─────────────────────────────────────────────────────────

  describe('COMMAND channel', () => {
    it('grants publish+subscribe to ADMIN', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: STAFF_USER_ID,
        displayName: 'Cmdr',
        role: Role.ADMIN,
      });
      prisma.event.findUnique.mockResolvedValue({ id: EVENT_ID, status: EventStatus.ACTIVE });

      const svc = await makeService();
      const r = await svc.issueToken(STAFF_USER_ID, { channel: 'COMMAND', channelId: EVENT_ID });

      expect(r.canPublish).toBe(true);
      expect(r.canSubscribe).toBe(true);
      expect(r.room).toBe(`command:${EVENT_ID}`);
    });

    it('rejects an OPERATOR with 403', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: OPERATOR_USER_ID,
        displayName: 'OpY',
        role: Role.OPERATOR,
      });

      const svc = await makeService();
      await expect(
        svc.issueToken(OPERATOR_USER_ID, { channel: 'COMMAND', channelId: EVENT_ID }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects when event is not ACTIVE', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: STAFF_USER_ID,
        displayName: 'C2',
        role: Role.ADMIN,
      });
      prisma.event.findUnique.mockResolvedValue({ id: EVENT_ID, status: EventStatus.ENDED });
      const svc = await makeService();
      await expect(
        svc.issueToken(STAFF_USER_ID, { channel: 'COMMAND', channelId: EVENT_ID }),
      ).rejects.toThrow(/ENDED/);
    });
  });

  // ─── Mode ────────────────────────────────────────────────────────────

  describe('livekit mode', () => {
    it('throws NotImplemented until deploy session plugs the real SDK', async () => {
      vi.resetModules();
      Object.assign(process.env, { ...TEST_ENV, VOICE_MODE: 'livekit' });

      const freshPrisma = {
        user: {
          findUnique: vi
            .fn()
            .mockResolvedValue({ id: STAFF_USER_ID, displayName: 'X', role: Role.ADMIN }),
        },
        event: {
          findUnique: vi.fn().mockResolvedValue({ id: EVENT_ID, status: EventStatus.ACTIVE }),
        },
      };

      const { VoiceService } = await import('./voice.service');
      const { PrismaService: FreshPrismaService } =
        await import('../../shared/database/prisma.service');
      const moduleRef = await Test.createTestingModule({
        providers: [VoiceService, { provide: FreshPrismaService, useValue: freshPrisma }],
      }).compile();
      const svc = moduleRef.get(VoiceService);

      await expect(
        svc.issueToken(STAFF_USER_ID, { channel: 'COMMAND', channelId: EVENT_ID }),
      ).rejects.toThrow(NotImplementedException);

      Object.assign(process.env, TEST_ENV);
      vi.resetModules();
    });
  });
});
