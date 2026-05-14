import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { EventsController } from './events.controller';
import { EventsRepository } from './events.repository';
import { EventsService } from './events.service';

@Module({
  // AuthModule wires JwtStrategy + AuthService used by JwtAuthGuard.
  imports: [AuthModule],
  controllers: [EventsController],
  providers: [EventsService, EventsRepository],
  exports: [EventsService],
})
export class EventsModule {}
