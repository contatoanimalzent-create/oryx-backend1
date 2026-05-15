import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import { PrismaService } from '../../shared/database/prisma.service';

@Injectable()
export class ReferralService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the operator's referral code, lazily creating one on first call.
   * Code is 8 chars from base32-style alphabet (no easily-confused chars).
   */
  async getOrCreateMyCode(userId: string) {
    const op = await this.requireOperator(userId);
    const existing = await this.prisma.referralCode.findUnique({
      where: { operatorId: op.id },
    });
    if (existing) return existing;
    return this.prisma.referralCode.create({
      data: { operatorId: op.id, code: this.generateCode() },
    });
  }

  /**
   * Called by the registration flow when a new operator was referred.
   * Reward is held PENDING until the referee participates in their first event
   * (handled by the events module — TODO when first match completes, flip
   * rewardPaid=true and credit the wallet).
   */
  async redeem(refereeUserId: string, code: string) {
    const referee = await this.requireOperator(refereeUserId);

    const codeRow = await this.prisma.referralCode.findUnique({ where: { code } });
    if (!codeRow) throw new NotFoundException('Invalid referral code.');
    if (codeRow.operatorId === referee.id) {
      throw new ConflictException('You cannot redeem your own referral code.');
    }

    const already = await this.prisma.referralRedemption.findUnique({
      where: { refereeId: referee.id },
    });
    if (already) {
      throw new ConflictException('This operator has already been referred.');
    }

    return this.prisma.referralRedemption.create({
      data: { codeId: codeRow.id, refereeId: referee.id },
    });
  }

  async myStats(userId: string) {
    const op = await this.requireOperator(userId);
    const code = await this.prisma.referralCode.findUnique({
      where: { operatorId: op.id },
      include: {
        redemptions: {
          include: { referee: { select: { callsign: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!code) {
      return { code: null, totalReferred: 0, paidCents: 0, redemptions: [] };
    }
    const paidCents = code.redemptions
      .filter((r) => r.rewardPaid)
      .reduce((sum, r) => sum + r.rewardCents, 0);
    return {
      code: code.code,
      totalReferred: code.redemptions.length,
      paidCents,
      redemptions: code.redemptions,
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private generateCode(): string {
    // Crockford-base32 minus IL01 to avoid visual ambiguity in shared links.
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const bytes = randomBytes(8);
    return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  }

  private async requireOperator(userId: string) {
    const op = await this.prisma.operator.findUnique({ where: { userId } });
    if (!op) throw new NotFoundException('No operator profile for this user.');
    return op;
  }
}
