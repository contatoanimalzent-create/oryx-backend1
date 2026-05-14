import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ZonesController } from './zones.controller';
import { ZonesRepository } from './zones.repository';
import { ZonesService } from './zones.service';

@Module({
  imports: [AuthModule],
  controllers: [ZonesController],
  providers: [ZonesService, ZonesRepository],
  exports: [ZonesService],
})
export class ZonesModule {}
