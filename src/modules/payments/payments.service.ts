import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { WalletTxKind } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import { WalletService } from '../wallet/wallet.service';

/**
 * Payment webhook entry points.
 *
 * Stripe + Pagar.me both POST signed events to /payments/*/webhook. We
 * verify the signature, parse the relevant event types, and credit/debit
 * the appropriate wallet via WalletService. Idempotency is enforced by
 * keying WalletTransaction.externalRef = provider event id.
 *
 * TODO(deploy): replace signature stub with real Stripe constructEvent and
 * Pagar.me Hashes signature verify when STRIPE_WEBHOOK_SECRET and
 * PAGARME_WEBHOOK_SECRET env vars are set.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallets: WalletService,
  ) {}

  async handleStripeWebhook(rawBody: string, signature: string | undefined) {
    // TODO: verify with stripe.webhooks.constructEvent
    const event = this.parseStripeStub(rawBody);
    if (!event || event.type !== 'payment_intent.succeeded') {
      return { handled: false };
    }
    const intent = event.data?.object;
    const userId = intent?.metadata?.user_id as string | undefined;
    const amount = intent?.amount as number | undefined;
    const eventId = event.id as string;
    if (!userId || !amount) {
      this.logger.warn({ eventId }, 'stripe event missing user_id or amount');
      return { handled: false };
    }

    // Idempotency: skip if we already saw this Stripe event id.
    const existing = await this.prisma.walletTransaction.findFirst({
      where: { externalRef: eventId },
    });
    if (existing) return { handled: true, deduped: true };

    const wallet = await this.wallets.getOrCreate(userId);
    await this.wallets.credit({
      walletId: wallet.id,
      amountCents: amount,
      kind: WalletTxKind.DEPOSIT,
      description: `Depósito Stripe ${intent.id}`,
      externalRef: eventId,
      metadata: { provider: 'stripe', intentId: intent.id },
    });
    return { handled: true };
  }

  async handlePagarmeWebhook(rawBody: string, signature: string | undefined) {
    // TODO: verify Pagar.me Hashes signature
    const event = this.parsePagarmeStub(rawBody);
    if (!event || event.type !== 'order.paid') {
      return { handled: false };
    }
    const order = event.data;
    const userId = order?.metadata?.user_id as string | undefined;
    const amount = order?.amount as number | undefined;
    const eventId = event.id as string;
    if (!userId || !amount) {
      this.logger.warn({ eventId }, 'pagarme event missing user_id or amount');
      return { handled: false };
    }
    const existing = await this.prisma.walletTransaction.findFirst({
      where: { externalRef: eventId },
    });
    if (existing) return { handled: true, deduped: true };

    const wallet = await this.wallets.getOrCreate(userId);
    await this.wallets.credit({
      walletId: wallet.id,
      amountCents: amount,
      kind: WalletTxKind.DEPOSIT,
      description: `Depósito PIX (Pagar.me) ${order.code}`,
      externalRef: eventId,
      metadata: { provider: 'pagarme', orderCode: order.code },
    });
    return { handled: true };
  }

  private parseStripeStub(raw: string): any {
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  private parsePagarmeStub(raw: string): any {
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }
}
