import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { NOTIFICATIONS_QUEUE_NAME } from './dto/notifications.dto';
import { NotificationsController } from './notifications.controller';
import { NotificationsMissionListener } from './notifications.mission-listener';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [AuthModule, BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE_NAME })],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsProcessor, NotificationsMissionListener],
  exports: [NotificationsService],
})
export class NotificationsModule {}
