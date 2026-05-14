import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ReputationModule } from '../reputation/reputation.module';
import { AntiCheatProcessor } from './anti-cheat.processor';
import { AntiCheatService } from './anti-cheat.service';
import { ANTI_CHEAT_QUEUE_NAME } from './dto/anti-cheat.dto';

@Module({
  imports: [BullModule.registerQueue({ name: ANTI_CHEAT_QUEUE_NAME }), ReputationModule],
  providers: [AntiCheatService, AntiCheatProcessor],
  exports: [AntiCheatService],
})
export class AntiCheatModule {}
