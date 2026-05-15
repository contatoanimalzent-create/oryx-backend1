import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  friendshipActionSchema,
  sendFriendRequestSchema,
} from './dto/social.dto';
import { SocialService } from './social.service';

function parse<T>(schema: { parse: (v: unknown) => T }, value: unknown): T {
  return schema.parse(value);
}

@ApiTags('social')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('social/friendships')
export class FriendshipsController {
  constructor(private readonly social: SocialService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  send(@CurrentUser('id') userId: string, @Body() body: unknown) {
    return this.social.sendRequest(userId, parse(sendFriendRequestSchema, body));
  }

  @Get()
  list(@CurrentUser('id') userId: string) {
    return this.social.listFriends(userId);
  }

  @Get('pending')
  pending(@CurrentUser('id') userId: string) {
    return this.social.listPendingIncoming(userId);
  }

  @Patch(':id')
  respond(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.social.respondToRequest(userId, id, parse(friendshipActionSchema, body));
  }
}
