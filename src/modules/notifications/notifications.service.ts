import { InjectQueue } from '@nestjs/bullmq';
import { ConflictException, Injectable } from '@nestjs/common';
import {
  type DeviceToken,
  type Notification,
  NotificationStatus,
  type Prisma,
} from '@prisma/client';
import type { Queue } from 'bullmq';

import { PrismaService } from '../../shared/database/prisma.service';
import {
  type CreateNotificationDto,
  type DeviceTokenView,
  type NotificationDispatchJob,
  type NotificationView,
  NOTIFICATIONS_QUEUE_NAME,
  type RegisterDeviceDto,
} from './dto/notifications.dto';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(NOTIFICATIONS_QUEUE_NAME)
    private readonly queue: Queue<NotificationDispatchJob>,
  ) {}

  // ─── Notifications ─────────────────────────────────────────────────────

  /**
   * Creates a PENDING notification + enqueues dispatch. Internal callers
   * (mission-listener) skip `createdById` since it's a system event; admin
   * controller passes the user id of the current admin.
   */
  async create(dto: CreateNotificationDto, createdById: string | null): Promise<NotificationView> {
    const notification = await this.prisma.notification.create({
      data: {
        target: dto.target,
        targetId: dto.targetId ?? null,
        title: dto.title,
        body: dto.body,
        createdById: createdById ?? null,
      },
    });

    await this.queue.add(
      'dispatch',
      { notificationId: notification.id },
      {
        jobId: notification.id, // 1 job per notification — natural dedup
        removeOnComplete: 1_000,
        removeOnFail: 1_000,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
      },
    );

    return this.toView(notification);
  }

  // ─── Device tokens ─────────────────────────────────────────────────────

  /**
   * Upserts on token: if Firebase reissues the same token to a different
   * user (rare edge case — reinstall on a shared device), the new owner
   * takes over.
   */
  async registerDevice(userId: string, dto: RegisterDeviceDto): Promise<DeviceTokenView> {
    const existing = await this.prisma.deviceToken.findUnique({
      where: { token: dto.token },
    });
    let row: DeviceToken;
    if (existing) {
      row = await this.prisma.deviceToken.update({
        where: { token: dto.token },
        data: { userId, platform: dto.platform },
      });
    } else {
      row = await this.prisma.deviceToken.create({
        data: { userId, token: dto.token, platform: dto.platform },
      });
    }
    return {
      id: row.id,
      token: row.token,
      platform: row.platform,
      registeredAt: row.registeredAt.toISOString(),
    };
  }

  /**
   * Only the owner can unregister. Returns silently if the token is unknown
   * (idempotent — mobile may retry on flaky network).
   */
  async unregisterDevice(userId: string, token: string): Promise<void> {
    const row = await this.prisma.deviceToken.findUnique({ where: { token } });
    if (!row) return;
    if (row.userId !== userId) {
      throw new ConflictException('Device token belongs to another user.');
    }
    await this.prisma.deviceToken.delete({ where: { token } });
  }

  // ─── Internals used by processor ───────────────────────────────────────

  /**
   * Resolves a (target, targetId) pair into the FCM token list. Worker calls
   * this at dispatch time (not at create time) so devices that register in
   * the meantime are included.
   */
  async resolveTokens(notification: Notification): Promise<DeviceToken[]> {
    switch (notification.target) {
      case 'GLOBAL':
        return this.prisma.deviceToken.findMany();

      case 'INDIVIDUAL': {
        if (!notification.targetId) return [];
        return this.prisma.deviceToken.findMany({
          where: { userId: notification.targetId },
        });
      }

      case 'EVENT': {
        if (!notification.targetId) return [];
        // event -> teams -> squads -> squad_members -> operators -> users
        return this.prisma.deviceToken.findMany({
          where: {
            user: {
              operator: {
                squadMemberships: {
                  some: { squad: { team: { eventId: notification.targetId } } },
                },
              },
            },
          },
        });
      }

      case 'TEAM': {
        if (!notification.targetId) return [];
        return this.prisma.deviceToken.findMany({
          where: {
            user: {
              operator: {
                squadMemberships: {
                  some: { squad: { teamId: notification.targetId } },
                },
              },
            },
          },
        });
      }

      case 'SQUAD': {
        if (!notification.targetId) return [];
        return this.prisma.deviceToken.findMany({
          where: {
            user: {
              operator: {
                squadMemberships: { some: { squadId: notification.targetId } },
              },
            },
          },
        });
      }
    }
  }

  async findById(id: string): Promise<Notification | null> {
    return this.prisma.notification.findUnique({ where: { id } });
  }

  async markStatus(
    id: string,
    update: {
      status: NotificationStatus;
      sentCount?: number;
      failedCount?: number;
      sentAt?: Date;
      error?: string;
    },
  ): Promise<Notification> {
    const data: Prisma.NotificationUpdateInput = { status: update.status };
    if (update.sentCount !== undefined) data.sentCount = update.sentCount;
    if (update.failedCount !== undefined) data.failedCount = update.failedCount;
    if (update.sentAt !== undefined) data.sentAt = update.sentAt;
    if (update.error !== undefined) data.error = update.error;
    return this.prisma.notification.update({ where: { id }, data });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  private toView(n: Notification): NotificationView {
    return {
      id: n.id,
      target: n.target,
      targetId: n.targetId,
      title: n.title,
      body: n.body,
      status: n.status,
      sentCount: n.sentCount,
      failedCount: n.failedCount,
      sentAt: n.sentAt ? n.sentAt.toISOString() : null,
      error: n.error,
      createdAt: n.createdAt.toISOString(),
    };
  }
}
