import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaymentsService } from './payments.service';

const depositIntentSchema = z.object({
  amountCents: z.number().int().min(100).max(10_000_000),
});

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('intents/deposit')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  createDeposit(
    @CurrentUser('id') userId: string,
    @Body() body: unknown,
  ) {
    const dto = depositIntentSchema.parse(body);
    return this.payments.createDepositIntent(userId, dto.amountCents);
  }

  @Post('stripe/webhook')
  @ApiExcludeEndpoint()
  @HttpCode(HttpStatus.OK)
  stripe(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') sig?: string,
  ) {
    // Stripe requires the EXACT raw bytes for signature verification.
    // main.ts mounts a rawBody-preserving body parser for /payments/* routes.
    const raw = req.rawBody ?? Buffer.from('');
    return this.payments.handleStripeWebhook(raw, sig);
  }

  @Post('pagarme/webhook')
  @ApiExcludeEndpoint()
  @HttpCode(HttpStatus.OK)
  pagarme(
    @Body() body: unknown,
    @Headers('x-hub-signature') sig?: string,
  ) {
    return this.payments.handlePagarmeWebhook(JSON.stringify(body), sig);
  }
}
