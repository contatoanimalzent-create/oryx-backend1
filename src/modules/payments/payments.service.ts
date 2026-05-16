import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { WalletTxKind } from '@prisma/client';
import Stripe from 'stripe';

import { loadEnv } from '../../config/env';
import { PrismaService } from '../../shared/database/prisma.service';
import { WalletService } from '../wallet/wallet.service';

/**
 * Stripe + Pagar.me payment lifecycle.
 *
 * Stripe is fully wired:
 *   1. createPaymentIntent — mobile/web client requests intent for a wallet
 *      deposit or marketplace purchase; we return clientSecret.
 *   2. Client confirms payment via Stripe Elements / Mobile SDK.
 *   3. Stripe POSTs payment_intent.succeeded to /payments/stripe/webhook.
 *   4. We verify the signature, look up the intent, and credit the wallet
 *      idempotently (externalRef = event.id).
 *
 * Pagar.me path is still stub-shaped; activate when PAGARME_API_KEY arrives.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly env = loadEnv();
  private readonly stripe: Stripe | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallets: WalletService,
  ) {
    this.stripe = this.env.STRIPE_SECRET_KEY
      ? new Stripe(this.env.STRIPE_SECRET_KEY, {
          // Pin API version so a Stripe-side bump doesn't change our payloads.
          apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion,
          appInfo: { name: 'oryx-backend', version: '0.1.0' },
        })
      : null;
  }

  // ─── Client-side intent creation ──────────────────────────────────────

  /**
   * Creates a PaymentIntent and returns the client_secret the mobile SDK
   * needs to confirm the payment. Metadata holds user_id + purpose so the
   * webhook handler knows which wallet to credit and why.
   */
  async createDepositIntent(
    userId: string,
    amountCents: number,
  ): Promise<{ clientSecret: string; intentId: string }> {
    if (!this.stripe) {
      throw new ServiceUnavailableException('Stripe is not configured.');
    }
    if (amountCents < 100) {
      throw new BadRequestException('Minimum deposit is R$ 1,00.');
    }
    const intent = await this.stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'brl',
      automatic_payment_methods: { enabled: true },
      metadata: { user_id: userId, purpose: 'wallet_deposit' },
    });
    return { clientSecret: intent.client_secret!, intentId: intent.id };
  }

  // ─── Webhook handlers ─────────────────────────────────────────────────

  async handleStripeWebhook(rawBody: Buffer, signature: string | undefined) {
    if (!this.stripe) {
      throw new ServiceUnavailableException('Stripe is not configured.');
    }
    if (!this.env.STRIPE_WEBHOOK_SECRET || !signature) {
      this.logger.warn('webhook secret or signature missing');
      throw new BadRequestException('Missing Stripe signature.');
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (err) {
      this.logger.error({ err: (err as Error).message }, 'invalid webhook signature');
      throw new BadRequestException('Invalid webhook signature.');
    }

    if (event.type !== 'payment_intent.succeeded') {
      return { handled: false, type: event.type };
    }

    // Idempotency — replay-safe via externalRef = event.id (unique upstream).
    const dedupe = await this.prisma.walletTransaction.findFirst({
      where: { externalRef: event.id },
    });
    if (dedupe) {
      return { handled: true, deduped: true };
    }

    const intent = event.data.object as Stripe.PaymentIntent;
    const userId = intent.metadata?.user_id;
    if (!userId) {
      this.logger.warn({ eventId: event.id }, 'intent missing user_id metadata');
      return { handled: false, reason: 'missing user_id' };
    }

    const wallet = await this.wallets.getOrCreate(userId);
    await this.wallets.credit({
      walletId: wallet.id,
      amountCents: intent.amount,
      kind: WalletTxKind.DEPOSIT,
      description: `Depósito Stripe ${intent.id}`,
      externalRef: event.id,
      metadata: {
        provider: 'stripe',
        intentId: intent.id,
        method: intent.payment_method_types,
      },
    });
    return { handled: true };
  }

  async handlePagarmeWebhook(rawBody: string, _signature: string | undefined) {
    // TODO(deploy): verify Pagar.me Hashes signature with PAGARME_WEBHOOK_SECRET.
    const event = this.safeParse(rawBody);
    if (!event || event.type !== 'order.paid') {
      return { handled: false };
    }
    const order = event.data;
    const userId = order?.metadata?.user_id as string | undefined;
    const amount = order?.amount as number | undefined;
    const eventId = event.id as string;
    if (!userId || !amount) return { handled: false };

    const dedupe = await this.prisma.walletTransaction.findFirst({
      where: { externalRef: eventId },
    });
    if (dedupe) return { handled: true, deduped: true };

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

  private safeParse(raw: string): any {
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }
}
