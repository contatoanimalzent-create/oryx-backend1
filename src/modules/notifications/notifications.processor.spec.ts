import { ServiceUnavailableException } from '@nestjs/common';
import { NotificationStatus, NotificationTarget } from '@prisma/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NotificationsService } from './notifications.service';

const TEST_ENV_BASE = {
  NODE_ENV: 'test',
  PORT: '3000',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://x:x@localhost:5432/x',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

const NOTIFICATION_ID = 'n-1';
const job = { id: 'job-1', data: { notificationId: NOTIFICATION_ID } } as never;

describe('NotificationsProcessor', () => {
  let service: {
    findById: ReturnType<typeof vi.fn>;
    resolveTokens: ReturnType<typeof vi.fn>;
    markStatus: ReturnType<typeof vi.fn>;
    deleteDeviceTokens: ReturnType<typeof vi.fn>;
  };

  beforeAll(() => {
    Object.assign(process.env, TEST_ENV_BASE);
  });

  beforeEach(() => {
    service = {
      findById: vi.fn(),
      resolveTokens: vi.fn(),
      markStatus: vi.fn().mockResolvedValue({}),
      deleteDeviceTokens: vi.fn().mockResolvedValue(0),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function makeProcessor(mode: 'stub' | 'fcm') {
    Object.assign(process.env, TEST_ENV_BASE, { NOTIFICATIONS_MODE: mode });
    vi.resetModules();
    const { NotificationsProcessor } = await import('./notifications.processor');
    return new NotificationsProcessor(service as unknown as NotificationsService);
  }

  // ─── early exits ────────────────────────────────────────────────────────

  it('skips when notification row is missing', async () => {
    const processor = await makeProcessor('stub');
    service.findById.mockResolvedValue(null);
    await processor.process(job);
    expect(service.markStatus).not.toHaveBeenCalled();
  });

  it('skips when notification is already SENT (idempotency)', async () => {
    const processor = await makeProcessor('stub');
    service.findById.mockResolvedValue({
      id: NOTIFICATION_ID,
      status: NotificationStatus.SENT,
    });
    await processor.process(job);
    expect(service.markStatus).not.toHaveBeenCalled();
  });

  // ─── stub mode ──────────────────────────────────────────────────────────

  it('marks SENT with sentCount=0 when no tokens resolve', async () => {
    const processor = await makeProcessor('stub');
    service.findById.mockResolvedValue({
      id: NOTIFICATION_ID,
      status: NotificationStatus.PENDING,
      target: NotificationTarget.GLOBAL,
      targetId: null,
    });
    service.resolveTokens.mockResolvedValue([]);

    await processor.process(job);

    expect(service.markStatus).toHaveBeenCalledWith(
      NOTIFICATION_ID,
      expect.objectContaining({
        status: NotificationStatus.SENT,
        sentCount: 0,
        failedCount: 0,
      }),
    );
  });

  it('marks SENT with token count in stub mode', async () => {
    const processor = await makeProcessor('stub');
    service.findById.mockResolvedValue({
      id: NOTIFICATION_ID,
      status: NotificationStatus.PENDING,
      target: NotificationTarget.INDIVIDUAL,
      targetId: 'user-x',
    });
    service.resolveTokens.mockResolvedValue([{ id: 't1' }, { id: 't2' }, { id: 't3' }]);

    await processor.process(job);

    expect(service.markStatus).toHaveBeenCalledWith(
      NOTIFICATION_ID,
      expect.objectContaining({
        status: NotificationStatus.SENT,
        sentCount: 3,
        failedCount: 0,
      }),
    );
  });

  // ─── fcm mode ───────────────────────────────────────────────────────────

  it('marks FAILED when fcm mode is not configured', async () => {
    const processor = await makeProcessor('fcm');
    service.findById.mockResolvedValue({
      id: NOTIFICATION_ID,
      status: NotificationStatus.PENDING,
      target: NotificationTarget.GLOBAL,
      targetId: null,
    });
    service.resolveTokens.mockResolvedValue([{ id: 't1' }]);

    await expect(processor.process(job)).rejects.toThrow(ServiceUnavailableException);
    expect(service.markStatus).toHaveBeenCalledWith(
      NOTIFICATION_ID,
      expect.objectContaining({
        status: NotificationStatus.FAILED,
        error: expect.stringContaining('FCM is not configured'),
      }),
    );
  });
});
