import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WalletTxKind, WalletTxStatus, type WalletAccount } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';

interface CreditParams {
  walletId: string;
  amountCents: number; // positive
  kind: WalletTxKind;
  description: string;
  externalRef?: string;
  metadata?: Prisma.InputJsonValue;
  tx?: Prisma.TransactionClient;
}

type DebitParams = CreditParams;

/**
 * Wallet bookkeeping. All mutations go through credit() / debit() to keep
 * balanceCents in sync with the WalletTransaction ledger atomically.
 *
 * Payment integration (Stripe / Pagar.me) is intentionally NOT here — they
 * hit /wallet/deposits/webhook and on success call into credit().
 */
@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreate(userId: string): Promise<WalletAccount> {
    const op = await this.requireOperator(userId);
    const existing = await this.prisma.walletAccount.findUnique({
      where: { operatorId: op.id },
    });
    if (existing) return existing;
    return this.prisma.walletAccount.create({ data: { operatorId: op.id } });
  }

  async listTransactions(userId: string, take = 50) {
    const wallet = await this.getOrCreate(userId);
    return this.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 200),
    });
  }

  /**
   * Stub deposit endpoint — in production the payment provider webhook
   * confirms before we actually credit. For now we credit immediately and
   * mark COMPLETED so dev/QA can iterate on the wallet UI.
   */
  async stubDeposit(userId: string, amountCents: number) {
    if (amountCents <= 0) throw new BadRequestException('amount must be positive');
    const wallet = await this.getOrCreate(userId);
    return this.credit({
      walletId: wallet.id,
      amountCents,
      kind: WalletTxKind.DEPOSIT,
      description: `Depósito (stub) de R$ ${(amountCents / 100).toFixed(2)}`,
    });
  }

  async requestWithdrawal(userId: string, amountCents: number, pixKey: string) {
    if (amountCents <= 0) throw new BadRequestException('amount must be positive');
    const wallet = await this.getOrCreate(userId);
    if (wallet.balanceCents < amountCents) {
      throw new ConflictException('Insufficient balance.');
    }
    // Record as PENDING; finance team / cron picks up and processes.
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.walletAccount.update({
        where: { id: wallet.id },
        data: { balanceCents: { decrement: amountCents } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          kind: WalletTxKind.WITHDRAW,
          status: WalletTxStatus.PENDING,
          amountCents: -amountCents,
          description: `Saque PIX para ${pixKey}`,
          metadata: { pixKey },
        },
      });
      return updated;
    });
  }

  // ─── Internal API (used by referral, marketplace, events modules) ──────

  async credit(params: CreditParams): Promise<WalletAccount> {
    const exec = async (tx: Prisma.TransactionClient) => {
      const updated = await tx.walletAccount.update({
        where: { id: params.walletId },
        data: { balanceCents: { increment: params.amountCents } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: params.walletId,
          kind: params.kind,
          status: WalletTxStatus.COMPLETED,
          amountCents: params.amountCents,
          description: params.description,
          externalRef: params.externalRef,
          metadata: params.metadata,
          completedAt: new Date(),
        },
      });
      return updated;
    };
    return params.tx ? exec(params.tx) : this.prisma.$transaction(exec);
  }

  async debit(params: DebitParams): Promise<WalletAccount> {
    const exec = async (tx: Prisma.TransactionClient) => {
      const wallet = await tx.walletAccount.findUnique({
        where: { id: params.walletId },
      });
      if (!wallet) throw new NotFoundException('Wallet not found.');
      if (wallet.balanceCents < params.amountCents) {
        throw new ConflictException('Insufficient balance.');
      }
      const updated = await tx.walletAccount.update({
        where: { id: params.walletId },
        data: { balanceCents: { decrement: params.amountCents } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: params.walletId,
          kind: params.kind,
          status: WalletTxStatus.COMPLETED,
          amountCents: -params.amountCents,
          description: params.description,
          externalRef: params.externalRef,
          metadata: params.metadata,
          completedAt: new Date(),
        },
      });
      return updated;
    };
    return params.tx ? exec(params.tx) : this.prisma.$transaction(exec);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private async requireOperator(userId: string) {
    const op = await this.prisma.operator.findUnique({ where: { userId } });
    if (!op) throw new NotFoundException('No operator profile for this user.');
    return op;
  }
}
