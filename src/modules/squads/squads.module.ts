import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { SquadsController } from './squads.controller';
import { SquadsRepository } from './squads.repository';
import { SquadsService } from './squads.service';

@Module({
  imports: [AuthModule],
  controllers: [SquadsController],
  providers: [SquadsService, SquadsRepository],
  exports: [SquadsService],
})
export class SquadsModule {}
