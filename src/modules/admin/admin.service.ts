import { Injectable, NotFoundException } from '@nestjs/common';
import { OperatorStatus, ProductStatus } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';

/**
 * Cross-domain admin actions. Each one is a small, audited mutation —
 * not a full module of its own. Real production should append rows to
 * an AuditLog table; today we just log via Nest's default logger.
 */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Operators ────────────────────────────────────────────────────────

  async searchOperators(q?: string, take = 50) {
    return this.prisma.operator.findMany({
      where: q
        ? {
            OR: [
              { callsign: { contains: q, mode: 'insensitive' } },
              { user: { email: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : undefined,
      include: {
        user: { select: { email: true, role: true } },
        _count: { select: { cheatSuspicions: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(take, 200),
    });
  }

  async setOperatorStatus(operatorId: string, status: OperatorStatus) {
    const op = await this.prisma.operator.findUnique({ where: { id: operatorId } });
    if (!op) throw new NotFoundException('Operator not found.');
    return this.prisma.operator.update({
      where: { id: operatorId },
      data: { status },
    });
  }

  // ─── Wallet oversight ─────────────────────────────────────────────────

  async recentWalletTransactions(take = 50) {
    return this.prisma.walletTransaction.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 200),
      include: {
        wallet: {
          include: {
            operator: { select: { callsign: true } },
          },
        },
      },
    });
  }

  // ─── Anti-cheat ───────────────────────────────────────────────────────

  async listSuspicions(status?: string) {
    return this.prisma.cheatSuspicion.findMany({
      where: status ? { status: status as never } : undefined,
      include: {
        operator: { select: { callsign: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async resolveSuspicion(
    id: string,
    action: 'CONFIRM' | 'DISMISS',
    reviewedByUserId: string,
  ) {
    const suspicion = await this.prisma.cheatSuspicion.findUnique({ where: { id } });
    if (!suspicion) throw new NotFoundException('Suspicion not found.');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.cheatSuspicion.update({
        where: { id },
        data: {
          status: action === 'CONFIRM' ? ('CONFIRMED' as never) : ('DISMISSED' as never),
          reviewedAt: new Date(),
          reviewedById: reviewedByUserId,
        },
      });
      // Auto-suspend operator on CONFIRM (manual ban via setOperatorStatus
      // when severity is HIGH).
      if (action === 'CONFIRM') {
        await tx.operator.update({
          where: { id: suspicion.operatorId },
          data: { status: OperatorStatus.SUSPENDED },
        });
      }
      return updated;
    });
  }

  // ─── Marketplace moderation ───────────────────────────────────────────

  async listReportedProducts() {
    // Status REMOVED with a paper trail; you'd add a Reports table for
    // user-submitted reports. For now we surface the recently-removed list.
    return this.prisma.product.findMany({
      where: { status: ProductStatus.REMOVED },
      include: { seller: { select: { callsign: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
  }

  async removeProductAsAdmin(productId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found.');
    return this.prisma.product.update({
      where: { id: productId },
      data: { status: ProductStatus.REMOVED },
    });
  }
}
