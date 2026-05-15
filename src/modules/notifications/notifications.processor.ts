import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { NotificationStatus } from '@prisma/client';
import type { Job } from 'bullmq';

import { loadEnv } from '../../config/env';
import { type NotificationDispatchJob, NOTIFICATIONS_QUEUE_NAME } from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';

@Processor(NOTIFICATIONS_QUEUE_NAME)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);
  private readonly env = loadEnv();
  private firebaseApp: App | undefined;

  constructor(private readonly service: NotificationsService) {
    super();
  }

  async process(job: Job<NotificationDispatchJob>): Promise<void> {
    const { notificationId } = job.data;
    const notification = await this.service.findById(notificationId);
    if (!notification) {
      this.logger.warn({ notificationId }, 'notification not found, skipping');
      return;
    }
    if (notification.status !== NotificationStatus.PENDING) {
      // Idempotency — concurrent retries land here as no-ops.
      this.logger.debug(
        { notificationId, status: notification.status },
        'notification not in PENDING state, skipping',
      );
      return;
    }

    const tokens = await this.service.resolveTokens(notification);
    if (tokens.length === 0) {
      this.logger.debug({ notificationId }, 'no devices for target, marking SENT with 0');
      await this.service.markStatus(notificationId, {
        status: NotificationStatus.SENT,
        sentCount: 0,
        failedCount: 0,
        sentAt: new Date(),
      });
      return;
    }

    if (this.env.NOTIFICATIONS_MODE === 'stub') {
      // Pretend every token succeeded. Real Firebase responses (success/
      // failure per-token + invalid-token cleanup) plug in below in `fcm` mode.
      this.logger.log(
        { notificationId, target: notification.target, tokens: tokens.length },
        '[stub] would dispatch FCM',
      );
      await this.service.markStatus(notificationId, {
        status: NotificationStatus.SENT,
        sentCount: tokens.length,
        failedCount: 0,
        sentAt: new Date(),
      });
      return;
    }

    try {
      const response = await getMessaging(this.getFirebaseApp()).sendEachForMulticast({
        tokens: tokens.map((token) => token.token),
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: {
          notificationId: notification.id,
          target: notification.target,
          targetId: notification.targetId ?? '',
        },
      });

      const invalidTokens = response.responses
        .map((result, index) => ({ result, token: tokens[index]?.token }))
        .filter(({ result }) => this.isInvalidTokenError(result.error?.code))
        .map(({ token }) => token)
        .filter((token): token is string => Boolean(token));

      const pruned = await this.service.deleteDeviceTokens(invalidTokens);
      if (pruned > 0) {
        this.logger.warn({ notificationId, pruned }, 'removed invalid FCM device tokens');
      }

      await this.service.markStatus(notificationId, {
        status: response.failureCount > 0 ? NotificationStatus.FAILED : NotificationStatus.SENT,
        sentCount: response.successCount,
        failedCount: response.failureCount,
        sentAt: response.successCount > 0 ? new Date() : undefined,
        error: response.failureCount > 0 ? `FCM failed for ${response.failureCount} tokens` : null,
      });
    } catch (err) {
      await this.service.markStatus(notificationId, {
        status: NotificationStatus.FAILED,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  private getFirebaseApp(): App {
    if (this.firebaseApp) return this.firebaseApp;
    if (!this.env.FCM_PROJECT_ID || !this.env.FCM_CREDENTIALS_JSON) {
      throw new ServiceUnavailableException(
        'FCM is not configured. Set FCM_PROJECT_ID and FCM_CREDENTIALS_JSON.',
      );
    }

    const credentialJson = JSON.parse(this.env.FCM_CREDENTIALS_JSON) as Record<string, unknown>;
    this.firebaseApp =
      getApps()[0] ??
      initializeApp({
        projectId: this.env.FCM_PROJECT_ID,
        credential: cert(credentialJson),
      });
    return this.firebaseApp;
  }

  private isInvalidTokenError(code: string | undefined): boolean {
    return (
      code === 'messaging/invalid-registration-token' ||
      code === 'messaging/registration-token-not-registered'
    );
  }
}
