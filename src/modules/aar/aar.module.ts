import { Module } from '@nestjs/common';

import { AnalyticsModule } from '../analytics/analytics.module';
import { AuthModule } from '../auth/auth.module';
import { AarController } from './aar.controller';
import { AarService } from './aar.service';

@Module({
  imports: [AuthModule, AnalyticsModule],
  controllers: [AarController],
  providers: [AarService],
  exports: [AarService],
})
export class AarModule {}
