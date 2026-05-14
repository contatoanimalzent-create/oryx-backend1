import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AntiCheatProcessor } from './anti-cheat.processor';
import { AntiCheatService } from './anti-cheat.service';

describe('AntiCheatProcessor', () => {
  let processor: AntiCheatProcessor;
  let service: { inspectPosition: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    service = { inspectPosition: vi.fn().mockResolvedValue([]) };
    const moduleRef = await Test.createTestingModule({
      providers: [AntiCheatProcessor, { provide: AntiCheatService, useValue: service }],
    }).compile();
    processor = moduleRef.get(AntiCheatProcessor);
  });

  afterEach(() => vi.restoreAllMocks());

  it('delegates the job payload to AntiCheatService', async () => {
    const data = {
      eventId: '11111111-1111-1111-1111-111111111111',
      operatorId: '22222222-2222-2222-2222-222222222222',
      lat: -23.55,
      lon: -46.62,
      recordedAt: '2026-05-12T20:00:00.000Z',
    };
    await processor.process({ id: 'job-1', data } as never);
    expect(service.inspectPosition).toHaveBeenCalledWith(data);
  });

  it('rethrows when the service throws so BullMQ can retry', async () => {
    service.inspectPosition.mockRejectedValueOnce(new Error('boom'));
    await expect(
      processor.process({
        id: 'job-x',
        data: {
          eventId: '11111111-1111-1111-1111-111111111111',
          operatorId: '22222222-2222-2222-2222-222222222222',
          lat: 0,
          lon: 0,
          recordedAt: '2026-05-12T20:00:00.000Z',
        },
      } as never),
    ).rejects.toThrow('boom');
  });
});
