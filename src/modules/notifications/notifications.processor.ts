import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, NotImplementedException } from '@nestjs/common';
import { NotificationStatus } from '@prisma/client';
import type { Job } from 'bullmq';

import { loadEnv } from '../../config/env';
import { type NotificationDispatchJob, NOTIFICATIONS_QUEUE_NAME } from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';

@Processor(NOTIFICATIONS_QUEUE_NAME)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);
  private readonly env = loadEnv();

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

    // ─── fcm mode (sessão de deploy) ─────────────────────────────────────
    // TODO(deploy): import firebase-admin, init with FCM_PROJECT_ID +
    // FCM_CREDENTIALS_JSON, send via messaging().sendEachForMulticast(),
    // tally success/failure, prune invalid tokens from device_tokens.
    await this.service.markStatus(notificationId, {
      status: NotificationStatus.FAILED,
      error: 'NOTIFICATIONS_MODE=fcm not implemented yet',
    });
    throw new NotImplementedException(
      'NOTIFICATIONS_MODE=fcm is not implemented yet. Switch to NOTIFICATIONS_MODE=stub for local dev.',
    );
  }
}
