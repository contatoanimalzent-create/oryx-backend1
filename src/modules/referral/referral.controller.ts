import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReferralService } from './referral.service';

const redeemSchema = z.object({
  code: z.string().regex(/^[A-Z0-9]{8}$/, 'code must be 8 uppercase chars'),
});

@ApiTags('referral')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('referral')
export class ReferralController {
  constructor(private readonly referral: ReferralService) {}

  @Get('me')
  myCode(@CurrentUser('id') userId: string) {
    return this.referral.getOrCreateMyCode(userId);
  }

  @Get('me/stats')
  myStats(@CurrentUser('id') userId: string) {
    return this.referral.myStats(userId);
  }

  @Post('redeem')
  @HttpCode(HttpStatus.CREATED)
  redeem(@CurrentUser('id') userId: string, @Body() body: unknown) {
    const dto = redeemSchema.parse(body);
    return this.referral.redeem(userId, dto.code);
  }
}
