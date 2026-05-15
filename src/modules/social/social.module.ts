import { Module } from '@nestjs/common';

import { FriendshipsController } from './friendships.controller';
import { FeedController } from './feed.controller';
import { SocialService } from './social.service';

@Module({
  controllers: [FriendshipsController, FeedController],
  providers: [SocialService],
  exports: [SocialService],
})
export class SocialModule {}
