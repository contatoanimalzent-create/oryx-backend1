import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { AntiCheatService } from './anti-cheat.service';
import { ANTI_CHEAT_QUEUE_NAME, type AntiCheatInspectJob } from './dto/anti-cheat.dto';

@Processor(ANTI_CHEAT_QUEUE_NAME)
export class AntiCheatProcessor extends WorkerHost {
  private readonly logger = new Logger(AntiCheatProcessor.name);

  constructor(private readonly service: AntiCheatService) {
    super();
  }

  async process(job: Job<AntiCheatInspectJob>): Promise<void> {
    try {
      await this.service.inspectPosition(job.data);
    } catch (err) {
      this.logger.error(
        {
          jobId: job.id,
          eventId: job.data.eventId,
          operatorId: job.data.operatorId,
          error: err instanceof Error ? err.message : err,
        },
        'anti-cheat job failed',
      );
      throw err;
    }
  }
}
