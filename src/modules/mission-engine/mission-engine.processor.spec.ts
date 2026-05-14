import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MissionProgressJob } from './dto/mission-engine.dto';
import { MissionEngineProcessor } from './mission-engine.processor';
import type { MissionEngineService } from './mission-engine.service';

const job: { id: string; data: MissionProgressJob } = {
  id: 'job-1',
  data: {
    eventId: '11111111-1111-1111-1111-111111111111',
    operatorId: '22222222-2222-2222-2222-222222222222',
    lat: -23.55,
    lon: -46.62,
    recordedAt: '2026-05-04T15:00:00.000Z',
  },
};

describe('MissionEngineProcessor', () => {
  let processor: MissionEngineProcessor;
  let engine: { processPosition: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    engine = { processPosition: vi.fn().mockResolvedValue(undefined) };
    processor = new MissionEngineProcessor(engine as unknown as MissionEngineService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards the job payload to the engine', async () => {
    await processor.process(job as never);
    expect(engine.processPosition).toHaveBeenCalledWith(job.data);
  });

  it('rethrows engine errors so BullMQ can retry', async () => {
    engine.processPosition.mockRejectedValue(new Error('engine failed'));
    await expect(processor.process(job as never)).rejects.toThrow('engine failed');
  });
});
