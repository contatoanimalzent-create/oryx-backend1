import { DevicePlatform, NotificationStatus, NotificationTarget } from '@prisma/client';
import { z } from 'zod';

export { DevicePlatform, NotificationStatus, NotificationTarget };

export const NOTIFICATIONS_QUEUE_NAME = 'notifications-dispatch';

const TITLE_MIN = 1;
const TITLE_MAX = 200;
const BODY_MIN = 1;
const BODY_MAX = 4_000;

const titleSchema = z.string().trim().min(TITLE_MIN).max(TITLE_MAX);
const bodySchema = z.string().trim().min(BODY_MIN).max(BODY_MAX);

/**
 * GLOBAL notifications must NOT carry a targetId. The other 4 channels
 * require a UUID — controller delegates the meaning (eventId / teamId /
 * squadId / userId) to the dispatcher.
 */
export const createNotificationSchema = z
  .object({
    target: z.nativeEnum(NotificationTarget),
    targetId: z.string().uuid().nullable().optional(),
    title: titleSchema,
    body: bodySchema,
  })
  .superRefine((value, ctx) => {
    if (value.target === NotificationTarget.GLOBAL) {
      if (value.targetId !== undefined && value.targetId !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['targetId'],
          message: 'GLOBAL notifications must not carry a targetId.',
        });
      }
    } else {
      if (!value.targetId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['targetId'],
          message: `${value.target} notifications require targetId (UUID).`,
        });
      }
    }
  });

export const registerDeviceSchema = z.object({
  token: z.string().trim().min(1).max(4_096),
  platform: z.nativeEnum(DevicePlatform),
});

export const unregisterDeviceSchema = z.object({
  token: z.string().trim().min(1).max(4_096),
});

export type CreateNotificationDto = z.infer<typeof createNotificationSchema>;
export type RegisterDeviceDto = z.infer<typeof registerDeviceSchema>;
export type UnregisterDeviceDto = z.infer<typeof unregisterDeviceSchema>;

export interface NotificationView {
  id: string;
  target: NotificationTarget;
  targetId: string | null;
  title: string;
  body: string;
  status: NotificationStatus;
  sentCount: number;
  failedCount: number;
  sentAt: string | null;
  error: string | null;
  createdAt: string;
}

export interface DeviceTokenView {
  id: string;
  token: string;
  platform: DevicePlatform;
  registeredAt: string;
}

/** Job payload pushed onto BullMQ — processor consumes. */
export interface NotificationDispatchJob {
  notificationId: string;
}
