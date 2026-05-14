import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { ZodSchema } from 'zod';

import type { AuthenticatedUser } from '../auth/dto/auth.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { type VoiceTokenView, issueVoiceTokenSchema } from './dto/voice.dto';
import { VoiceService } from './voice.service';

function parse<T>(schema: ZodSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(result.error.flatten());
  }
  return result.data;
}

@Controller('voice')
@UseGuards(JwtAuthGuard)
export class VoiceController {
  constructor(private readonly voice: VoiceService) {}

  /**
   * Mint a per-room access token. The service decides publish/subscribe
   * permissions from membership and role — the caller only states which
   * channel + id they want.
   */
  @Post('tokens')
  @HttpCode(HttpStatus.OK)
  async issue(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<VoiceTokenView> {
    return this.voice.issueToken(user.id, parse(issueVoiceTokenSchema, body));
  }
}
