import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CompetitiveController } from './competitive.controller';
import { CompetitiveService } from './competitive.service';

@Module({
  imports: [AuthModule],
  controllers: [CompetitiveController],
  providers: [CompetitiveService],
  exports: [CompetitiveService],
})
export class CompetitiveModule {}
