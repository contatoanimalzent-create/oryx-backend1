import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CosmeticKind, WalletTxKind } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class CosmeticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallets: WalletService,
  ) {}

  async listAvailable(kind?: CosmeticKind) {
    return this.prisma.cosmetic.findMany({
      where: { available: true, ...(kind && { kind }) },
      orderBy: [{ rarity: 'desc' }, { priceCents: 'asc' }],
    });
  }

  async listInventory(userId: string) {
    const op = await this.requireOperator(userId);
    return this.prisma.userCosmetic.findMany({
      where: { operatorId: op.id },
      include: { cosmetic: true },
      orderBy: { acquiredAt: 'desc' },
    });
  }

  async buy(userId: string, cosmeticId: string) {
    const op = await this.requireOperator(userId);
    const cosmetic = await this.prisma.cosmetic.findUnique({
      where: { id: cosmeticId },
    });
    if (!cosmetic) throw new NotFoundException('Cosmetic not found.');
    if (!cosmetic.available) {
      throw new ConflictException('Cosmetic is not available for purchase.');
    }
    const already = await this.prisma.userCosmetic.findUnique({
      where: {
        operatorId_cosmeticId: { operatorId: op.id, cosmeticId },
      },
    });
    if (already) {
      throw new ConflictException('You already own this cosmetic.');
    }

    if (cosmetic.priceCents > 0) {
      const wallet = await this.wallets.getOrCreate(userId);
      await this.wallets.debit({
        walletId: wallet.id,
        amountCents: cosmetic.priceCents,
        kind: WalletTxKind.ADJUSTMENT,
        description: `Cosmético: ${cosmetic.name}`,
        externalRef: cosmetic.id,
      });
    }

    return this.prisma.userCosmetic.create({
      data: { operatorId: op.id, cosmeticId },
    });
  }

  async equip(userId: string, cosmeticId: string) {
    const op = await this.requireOperator(userId);
    const ownership = await this.prisma.userCosmetic.findUnique({
      where: {
        operatorId_cosmeticId: { operatorId: op.id, cosmeticId },
      },
      include: { cosmetic: true },
    });
    if (!ownership) {
      throw new ForbiddenException("You don't own this cosmetic.");
    }
    return this.prisma.$transaction(async (tx) => {
      // Unequip any other cosmetic of the same kind (one equipped per slot).
      await tx.userCosmetic.updateMany({
        where: {
          operatorId: op.id,
          cosmetic: { kind: ownership.cosmetic.kind },
          NOT: { id: ownership.id },
        },
        data: { isEquipped: false },
      });
      return tx.userCosmetic.update({
        where: { id: ownership.id },
        data: { isEquipped: true },
      });
    });
  }

  private async requireOperator(userId: string) {
    const op = await this.prisma.operator.findUnique({ where: { userId } });
    if (!op) throw new NotFoundException('No operator profile for this user.');
    return op;
  }
}
