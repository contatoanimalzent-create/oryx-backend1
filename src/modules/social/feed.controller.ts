import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { createCommentSchema, createPostSchema } from './dto/social.dto';
import { SocialService } from './social.service';

function parse<T>(schema: { parse: (v: unknown) => T }, value: unknown): T {
  return schema.parse(value);
}

@ApiTags('social')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('social/feed')
export class FeedController {
  constructor(private readonly social: SocialService) {}

  @Get()
  list(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
    @Query('take') take?: string,
  ) {
    return this.social.listFeed(userId, {
      cursor,
      take: take ? Number(take) : undefined,
    });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser('id') userId: string, @Body() body: unknown) {
    return this.social.createPost(userId, parse(createPostSchema, body));
  }

  @Post(':id/like')
  @HttpCode(HttpStatus.OK)
  like(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.social.likePost(userId, id);
  }

  @Delete(':id/like')
  unlike(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.social.unlikePost(userId, id);
  }

  @Post(':id/comments')
  @HttpCode(HttpStatus.CREATED)
  comment(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.social.commentOnPost(userId, id, parse(createCommentSchema, body));
  }

  @Get(':id/comments')
  comments(@Param('id', ParseUUIDPipe) id: string) {
    return this.social.listComments(id);
  }
}
