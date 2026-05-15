import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WalletService } from './wallet.service';

const depositSchema = z.object({
  amountCents: z.number().int().positive().max(1_000_000),
});

const withdrawSchema = z.object({
  amountCents: z.number().int().positive().max(1_000_000),
  pixKey: z.string().min(5).max(140),
});

@ApiTags('wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get('me')
  me(@CurrentUser('id') userId: string) {
    return this.wallet.getOrCreate(userId);
  }

  @Get('me/transactions')
  txs(@CurrentUser('id') userId: string, @Query('take') take?: string) {
    return this.wallet.listTransactions(userId, take ? Number(take) : undefined);
  }

  @Post('deposits/stub')
  @HttpCode(HttpStatus.CREATED)
  deposit(@CurrentUser('id') userId: string, @Body() body: unknown) {
    const dto = depositSchema.parse(body);
    return this.wallet.stubDeposit(userId, dto.amountCents);
  }

  @Post('withdrawals')
  @HttpCode(HttpStatus.CREATED)
  withdraw(@CurrentUser('id') userId: string, @Body() body: unknown) {
    const dto = withdrawSchema.parse(body);
    return this.wallet.requestWithdrawal(userId, dto.amountCents, dto.pixKey);
  }
}
