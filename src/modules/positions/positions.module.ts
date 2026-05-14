import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ANTI_CHEAT_QUEUE_NAME } from '../anti-cheat/dto/anti-cheat.dto';
import { MISSION_PROGRESS_QUEUE_NAME } from '../mission-engine/dto/mission-engine.dto';
import { AuthModule } from '../auth/auth.module';
import { POSITIONS_QUEUE_NAME } from './dto/positions.dto';
import { PositionsController } from './positions.controller';
import { PositionsProcessor } from './positions.processor';
import { PositionsService } from './positions.service';

@Module({
  imports: [
    AuthModule,
    BullModule.registerQueue(
      { name: POSITIONS_QUEUE_NAME },
      // Producer-side registration: PositionsProcessor injects these Queues
      // at the end of process() to fan jobs out to downstream workers. The
      // actual consumers live in MissionEngineModule and AntiCheatModule.
      { name: MISSION_PROGRESS_QUEUE_NAME },
      { name: ANTI_CHEAT_QUEUE_NAME },
    ),
  ],
  controllers: [PositionsController],
  providers: [PositionsService, PositionsProcessor],
  exports: [PositionsService],
})
export class PositionsModule {}
