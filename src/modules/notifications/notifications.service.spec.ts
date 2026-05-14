import { getQueueToken } from '@nestjs/bullmq';
import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DevicePlatform, NotificationStatus, NotificationTarget } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../../shared/database/prisma.service';
import { NOTIFICATIONS_QUEUE_NAME, type CreateNotificationDto } from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';

const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const EVENT_ID = '33333333-3333-3333-3333-333333333333';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: {
    notification: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    deviceToken: {
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
  };
  let queue: { add: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = {
      notification: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      deviceToken: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    };
    queue = { add: vi.fn().mockResolvedValue({ id: 'job' }) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: getQueueToken(NOTIFICATIONS_QUEUE_NAME), useValue: queue },
      ],
    }).compile();
    service = moduleRef.get(NotificationsService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── create + enqueue ───────────────────────────────────────────────────

  describe('create', () => {
    it('persists PENDING and enqueues with notificationId as jobId', async () => {
      prisma.notification.create.mockResolvedValue({
        id: 'n-1',
        target: NotificationTarget.GLOBAL,
        targetId: null,
        title: 'Hi',
        body: 'World',
        status: NotificationStatus.PENDING,
        sentCount: 0,
        failedCount: 0,
        sentAt: null,
        error: null,
        createdAt: new Date(),
      });

      const dto: CreateNotificationDto = {
        target: NotificationTarget.GLOBAL,
        title: 'Hi',
        body: 'World',
      };
      await service.create(dto, ADMIN_ID);

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            createdById: ADMIN_ID,
            target: NotificationTarget.GLOBAL,
          }),
        }),
      );
      const [name, payload, opts] = queue.add.mock.calls[0] as [
        string,
        { notificationId: string },
        { jobId: string; attempts: number },
      ];
      expect(name).toBe('dispatch');
      expect(payload.notificationId).toBe('n-1');
      expect(opts.jobId).toBe('n-1');
      expect(opts.attempts).toBe(3);
    });

    it('passes null createdById for system-generated notifications', async () => {
      prisma.notification.create.mockResolvedValue({
        id: 'n-2',
        target: NotificationTarget.INDIVIDUAL,
        targetId: USER_ID,
        title: 'Mission completed',
        body: 'CP-Alpha (+50 pts)',
        status: NotificationStatus.PENDING,
        sentCount: 0,
        failedCount: 0,
        sentAt: null,
        error: null,
        createdAt: new Date(),
      });

      await service.create(
        {
          target: NotificationTarget.INDIVIDUAL,
          targetId: USER_ID,
          title: 'Mission completed',
          body: 'CP-Alpha (+50 pts)',
        },
        null,
      );

      const data = (
        prisma.notification.create.mock.calls[0][0] as { data: { createdById: string | null } }
      ).data;
      expect(data.createdById).toBeNull();
    });
  });

  // ─── device tokens ──────────────────────────────────────────────────────

  describe('registerDevice', () => {
    it('creates a new row when token is unknown', async () => {
      prisma.deviceToken.findUnique.mockResolvedValue(null);
      prisma.deviceToken.create.mockResolvedValue({
        id: 'd-1',
        userId: USER_ID,
        token: 'tok-1',
        platform: DevicePlatform.ANDROID,
        registeredAt: new Date(),
      });

      const result = await service.registerDevice(USER_ID, {
        token: 'tok-1',
        platform: DevicePlatform.ANDROID,
      });

      expect(prisma.deviceToken.create).toHaveBeenCalled();
      expect(result.token).toBe('tok-1');
    });

    it('reassigns ownership when the same token already exists', async () => {
      prisma.deviceToken.findUnique.mockResolvedValue({
        id: 'd-old',
        userId: 'previous-user',
        token: 'tok-1',
        platform: DevicePlatform.IOS,
        registeredAt: new Date(),
      });
      prisma.deviceToken.update.mockResolvedValue({
        id: 'd-old',
        userId: USER_ID,
        token: 'tok-1',
        platform: DevicePlatform.ANDROID,
        registeredAt: new Date(),
      });

      const result = await service.registerDevice(USER_ID, {
        token: 'tok-1',
        platform: DevicePlatform.ANDROID,
      });

      expect(prisma.deviceToken.update).toHaveBeenCalledWith({
        where: { token: 'tok-1' },
        data: { userId: USER_ID, platform: DevicePlatform.ANDROID },
      });
      expect(result.token).toBe('tok-1');
    });
  });

  describe('unregisterDevice', () => {
    it('is a no-op for unknown tokens', async () => {
      prisma.deviceToken.findUnique.mockResolvedValue(null);
      await service.unregisterDevice(USER_ID, 'unknown');
      expect(prisma.deviceToken.delete).not.toHaveBeenCalled();
    });

    it('refuses when token belongs to another user', async () => {
      prisma.deviceToken.findUnique.mockResolvedValue({
        id: 'd-1',
        userId: 'another-user',
        token: 'tok-1',
        platform: DevicePlatform.IOS,
        registeredAt: new Date(),
      });
      await expect(service.unregisterDevice(USER_ID, 'tok-1')).rejects.toThrow(ConflictException);
      expect(prisma.deviceToken.delete).not.toHaveBeenCalled();
    });

    it('deletes when the caller is the owner', async () => {
      prisma.deviceToken.findUnique.mockResolvedValue({
        id: 'd-1',
        userId: USER_ID,
        token: 'tok-1',
        platform: DevicePlatform.IOS,
        registeredAt: new Date(),
      });
      prisma.deviceToken.delete.mockResolvedValue({});
      await service.unregisterDevice(USER_ID, 'tok-1');
      expect(prisma.deviceToken.delete).toHaveBeenCalledWith({ where: { token: 'tok-1' } });
    });
  });

  // ─── target resolution ──────────────────────────────────────────────────

  describe('resolveTokens', () => {
    it('GLOBAL pulls everyone', async () => {
      prisma.deviceToken.findMany.mockResolvedValue([{ id: 'd-1' }]);
      await service.resolveTokens({
        id: 'n-1',
        target: NotificationTarget.GLOBAL,
        targetId: null,
      } as never);
      expect(prisma.deviceToken.findMany).toHaveBeenCalledWith();
    });

    it('INDIVIDUAL filters by user id', async () => {
      prisma.deviceToken.findMany.mockResolvedValue([]);
      await service.resolveTokens({
        id: 'n-1',
        target: NotificationTarget.INDIVIDUAL,
        targetId: USER_ID,
      } as never);
      expect(prisma.deviceToken.findMany).toHaveBeenCalledWith({
        where: { userId: USER_ID },
      });
    });

    it('EVENT walks event -> teams -> squads -> members', async () => {
      prisma.deviceToken.findMany.mockResolvedValue([]);
      await service.resolveTokens({
        id: 'n-1',
        target: NotificationTarget.EVENT,
        targetId: EVENT_ID,
      } as never);
      const where = (prisma.deviceToken.findMany.mock.calls[0][0] as { where: unknown }).where;
      // We just sanity-check structure — Prisma encodes the predicate as a deep
      // nested object reflecting the schema relations.
      expect(JSON.stringify(where)).toContain(EVENT_ID);
    });
  });
});
