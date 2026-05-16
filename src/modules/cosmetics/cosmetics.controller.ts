import {
  Controller,
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
import { CosmeticKind } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CosmeticsService } from './cosmetics.service';

@ApiTags('cosmetics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cosmetics')
export class CosmeticsController {
  constructor(private readonly cosmetics: CosmeticsService) {}

  @Get()
  list(@Query('kind') kind?: CosmeticKind) {
    return this.cosmetics.listAvailable(kind);
  }

  @Get('me')
  inventory(@CurrentUser('id') userId: string) {
    return this.cosmetics.listInventory(userId);
  }

  @Post(':id/buy')
  @HttpCode(HttpStatus.CREATED)
  buy(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cosmetics.buy(userId, id);
  }

  @Post(':id/equip')
  @HttpCode(HttpStatus.OK)
  equip(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cosmetics.equip(userId, id);
  }
}
