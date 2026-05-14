import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { MISSION_PROGRESS_QUEUE_NAME, type MissionProgressJob } from './dto/mission-engine.dto';
import { MissionEngineService } from './mission-engine.service';

@Processor(MISSION_PROGRESS_QUEUE_NAME)
export class MissionEngineProcessor extends WorkerHost {
  private readonly logger = new Logger(MissionEngineProcessor.name);

  constructor(private readonly engine: MissionEngineService) {
    super();
  }

  async process(job: Job<MissionProgressJob>): Promise<void> {
    try {
      await this.engine.processPosition(job.data);
    } catch (err) {
      this.logger.error(
        {
          jobId: job.id,
          eventId: job.data.eventId,
          operatorId: job.data.operatorId,
          error: err instanceof Error ? err.message : err,
        },
        'mission-engine job failed',
      );
      throw err;
    }
  }
}
