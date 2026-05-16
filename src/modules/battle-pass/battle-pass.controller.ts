import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BattlePassService } from './battle-pass.service';

@ApiTags('battle-pass')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('battle-pass')
export class BattlePassController {
  constructor(private readonly bp: BattlePassService) {}

  @Get('active')
  active() {
    return this.bp.getActiveSeason();
  }

  @Get('me')
  me(@CurrentUser('id') userId: string) {
    return this.bp.getMyProgress(userId);
  }

  @Post('claim/:level')
  @HttpCode(HttpStatus.OK)
  claim(
    @CurrentUser('id') userId: string,
    @Param('level', ParseIntPipe) level: number,
  ) {
    return this.bp.claim(userId, level);
  }

  @Post('buy-premium')
  @HttpCode(HttpStatus.OK)
  buyPremium(@CurrentUser('id') userId: string) {
    return this.bp.buyPremium(userId);
  }
}
