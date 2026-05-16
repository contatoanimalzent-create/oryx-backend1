import { Module } from '@nestjs/common';

import { MediaStorageController } from './media-storage.controller';
import { MediaStorageService } from './media-storage.service';

@Module({
  controllers: [MediaStorageController],
  providers: [MediaStorageService],
  exports: [MediaStorageService],
})
export class MediaStorageModule {}
