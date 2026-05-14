import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { MISSION_PROGRESS_QUEUE_NAME } from './dto/mission-engine.dto';
import { MissionEngineProcessor } from './mission-engine.processor';
import { MissionEngineService } from './mission-engine.service';

@Module({
  imports: [BullModule.registerQueue({ name: MISSION_PROGRESS_QUEUE_NAME })],
  providers: [MissionEngineService, MissionEngineProcessor],
  exports: [MissionEngineService],
})
export class MissionEngineModule {}
