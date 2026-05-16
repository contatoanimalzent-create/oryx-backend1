import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { PaymentsService } from './payments.service';

@ApiExcludeController()
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('stripe/webhook')
  @HttpCode(HttpStatus.OK)
  stripe(
    @Body() body: unknown,
    @Headers('stripe-signature') sig?: string,
  ) {
    return this.payments.handleStripeWebhook(JSON.stringify(body), sig);
  }

  @Post('pagarme/webhook')
  @HttpCode(HttpStatus.OK)
  pagarme(
    @Body() body: unknown,
    @Headers('x-hub-signature') sig?: string,
  ) {
    return this.payments.handlePagarmeWebhook(JSON.stringify(body), sig);
  }
}
