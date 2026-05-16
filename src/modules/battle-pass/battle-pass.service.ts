import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WalletTxKind } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class BattlePassService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallets: WalletService,
  ) {}

  /// Returns the season currently between startsAt and endsAt. Most ops
  /// only have one active season at a time.
  async getActiveSeason() {
    const now = new Date();
    const season = await this.prisma.battlePassSeason.findFirst({
      where: { startsAt: { lte: now }, endsAt: { gte: now } },
      include: {
        rewards: {
          orderBy: [{ level: 'asc' }, { premiumOnly: 'asc' }],
        },
      },
      orderBy: { number: 'desc' },
    });
    if (!season) {
      throw new NotFoundException('No active battle pass season.');
    }
    return season;
  }

  async getMyProgress(userId: string) {
    const op = await this.requireOperator(userId);
    const season = await this.getActiveSeason();
    const progress = await this.prisma.userBattlePass.upsert({
      where: {
        operatorId_seasonId: {
          operatorId: op.id,
          seasonId: season.id,
        },
      },
      create: { operatorId: op.id, seasonId: season.id },
      update: {},
    });
    return { season, progress, level: this.xpToLevel(progress.currentXp) };
  }

  /// Called by mission-engine / match aar when XP is awarded — credits the
  /// active season too. Throws if no active season; caller wraps in try.
  async addXp(operatorId: string, amount: number) {
    if (amount <= 0) return;
    const season = await this.getActiveSeason();
    await this.prisma.userBattlePass.upsert({
      where: {
        operatorId_seasonId: {
          operatorId,
          seasonId: season.id,
        },
      },
      create: { operatorId, seasonId: season.id, currentXp: amount },
      update: { currentXp: { increment: amount } },
    });
  }

  /// Marks a reward as claimed and applies its effects (cosmetic ownership,
  /// wallet bonus). Refuses if the level isn't reached yet or if premium-only
  /// reward is requested by a free user.
  async claim(userId: string, level: number) {
    const op = await this.requireOperator(userId);
    const season = await this.getActiveSeason();
    const progress = await this.prisma.userBattlePass.findUnique({
      where: {
        operatorId_seasonId: { operatorId: op.id, seasonId: season.id },
      },
    });
    if (!progress) {
      throw new ConflictException('No progress for active season.');
    }
    if (this.xpToLevel(progress.currentXp) < level) {
      throw new BadRequestException('Level not reached yet.');
    }
    if (progress.claimedLevels.includes(level)) {
      throw new ConflictException('Reward already claimed.');
    }

    const rewards = await this.prisma.battlePassReward.findMany({
      where: { seasonId: season.id, level },
    });
    return this.prisma.$transaction(async (tx) => {
      for (const r of rewards) {
        if (r.premiumOnly && !progress.isPremium) continue;
        if (r.cosmeticId) {
          await tx.userCosmetic.upsert({
            where: {
              operatorId_cosmeticId: {
                operatorId: op.id,
                cosmeticId: r.cosmeticId,
              },
            },
            create: { operatorId: op.id, cosmeticId: r.cosmeticId },
            update: {},
          });
        }
        if (r.walletBonusCents > 0) {
          const wallet = await tx.walletAccount.upsert({
            where: { operatorId: op.id },
            create: { operatorId: op.id },
            update: {},
          });
          await this.wallets.credit({
            walletId: wallet.id,
            amountCents: r.walletBonusCents,
            kind: WalletTxKind.REFERRAL_BONUS,
            description: `Battle Pass nível ${level} — recompensa`,
            tx,
          });
        }
      }
      return tx.userBattlePass.update({
        where: { id: progress.id },
        data: { claimedLevels: { push: level } },
      });
    });
  }

  /// Upgrades to premium. Cost is debited from wallet — alternative flow
  /// (Stripe webhook) just calls grantPremium() directly.
  async buyPremium(userId: string) {
    const op = await this.requireOperator(userId);
    const season = await this.getActiveSeason();
    const wallet = await this.wallets.getOrCreate(userId);
    if (wallet.balanceCents < season.premiumCents) {
      throw new ConflictException('Insufficient balance.');
    }
    await this.wallets.debit({
      walletId: wallet.id,
      amountCents: season.premiumCents,
      kind: WalletTxKind.ADJUSTMENT,
      description: `Battle Pass Premium — Temporada ${season.number}`,
    });
    return this.grantPremium(op.id, season.id);
  }

  async grantPremium(operatorId: string, seasonId: string) {
    return this.prisma.userBattlePass.upsert({
      where: { operatorId_seasonId: { operatorId, seasonId } },
      create: { operatorId, seasonId, isPremium: true },
      update: { isPremium: true },
    });
  }

  /// 1000 XP per level — adjust here when we want a curve instead of linear.
  private xpToLevel(xp: number): number {
    return Math.floor(xp / 1000) + 1;
  }

  private async requireOperator(userId: string) {
    const op = await this.prisma.operator.findUnique({ where: { userId } });
    if (!op) throw new NotFoundException('No operator profile for this user.');
    return op;
  }
}
