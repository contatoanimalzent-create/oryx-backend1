import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderStatus,
  Prisma,
  ProductStatus,
  WalletTxKind,
  type Product,
} from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import type {
  CreateOrderDto,
  CreateProductDto,
  UpdateProductDto,
} from './dto/marketplace.dto';

@Injectable()
export class MarketplaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallets: WalletService,
  ) {}

  // ─── Listings ─────────────────────────────────────────────────────────

  async listProducts(params: {
    category?: string;
    city?: string;
    state?: string;
    cursor?: string;
    take?: number;
  }) {
    return this.prisma.product.findMany({
      where: {
        status: ProductStatus.ACTIVE,
        ...(params.category && { category: params.category as never }),
        ...(params.city && { city: params.city }),
        ...(params.state && { state: params.state }),
      },
      include: {
        seller: { select: { id: true, callsign: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(params.take ?? 20, 50),
      ...(params.cursor && { cursor: { id: params.cursor }, skip: 1 }),
    });
  }

  async getProduct(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { seller: { select: { id: true, callsign: true } } },
    });
    if (!product) throw new NotFoundException('Product not found.');
    return product;
  }

  async createProduct(userId: string, dto: CreateProductDto): Promise<Product> {
    const seller = await this.requireOperator(userId);
    return this.prisma.product.create({
      data: { sellerId: seller.id, ...dto },
    });
  }

  async updateProduct(userId: string, id: string, dto: UpdateProductDto) {
    const seller = await this.requireOperator(userId);
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found.');
    if (product.sellerId !== seller.id) {
      throw new ForbiddenException('Only the seller can edit this product.');
    }
    if (product.status === ProductStatus.SOLD) {
      throw new ConflictException('Cannot edit a SOLD product.');
    }
    return this.prisma.product.update({ where: { id }, data: dto });
  }

  async removeProduct(userId: string, id: string) {
    const seller = await this.requireOperator(userId);
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found.');
    if (product.sellerId !== seller.id) {
      throw new ForbiddenException('Only the seller can remove this product.');
    }
    return this.prisma.product.update({
      where: { id },
      data: { status: ProductStatus.REMOVED },
    });
  }

  async listMyListings(userId: string) {
    const seller = await this.requireOperator(userId);
    return this.prisma.product.findMany({
      where: { sellerId: seller.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Orders ───────────────────────────────────────────────────────────

  /**
   * Creates an order and DEBITS the buyer's wallet immediately. In production
   * the wallet should hold escrow until the buyer confirms receipt; for now
   * we debit + mark PAID + reserve the product as SOLD in one transaction.
   *
   * TODO(escrow): split into a 2-phase flow — debit on PAID, transfer to
   * seller on DELIVERED, refund on CANCELLED.
   */
  async createOrder(userId: string, dto: CreateOrderDto) {
    const buyer = await this.requireOperator(userId);
    const buyerWallet = await this.wallets.getOrCreate(userId);

    return this.prisma.$transaction(async (tx) => {
      // 1. Lock all products (FOR UPDATE via findMany doesn't lock — Prisma
      //    doesn't expose row locks. We rely on UNIQUE status check below.)
      const productIds = dto.items.map((i) => i.productId);
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, status: ProductStatus.ACTIVE },
      });
      if (products.length !== productIds.length) {
        throw new ConflictException(
          'One or more products are unavailable or already sold.',
        );
      }
      if (products.some((p) => p.sellerId === buyer.id)) {
        throw new ConflictException('Cannot buy your own products.');
      }

      const productMap = new Map(products.map((p) => [p.id, p]));
      const totalCents = dto.items.reduce((sum, item) => {
        const p = productMap.get(item.productId)!;
        return sum + p.priceCents * item.qty;
      }, 0);
      const shippingCents = Math.round(totalCents * 0.05); // mock 5% — TODO Correios API

      // 2. Debit buyer wallet (throws if insufficient)
      const grand = totalCents + shippingCents;
      if (buyerWallet.balanceCents < grand) {
        throw new ConflictException('Insufficient wallet balance.');
      }

      // 3. Create order
      const order = await tx.order.create({
        data: {
          buyerId: buyer.id,
          totalCents: grand,
          shippingCents,
          status: OrderStatus.PAID,
          shippingAddress: dto.shippingAddress as unknown as Prisma.InputJsonValue,
          items: {
            create: dto.items.map((item) => ({
              productId: item.productId,
              qty: item.qty,
              unitPriceCents: productMap.get(item.productId)!.priceCents,
            })),
          },
        },
        include: { items: true },
      });

      // 4. Debit wallet via WalletService internal API (same transaction)
      await this.wallets.debit({
        walletId: buyerWallet.id,
        amountCents: grand,
        kind: WalletTxKind.MARKETPLACE_PURCHASE,
        description: `Pedido #${order.id.slice(0, 8)} no marketplace`,
        externalRef: order.id,
        tx,
      });

      // 5. Credit each seller (minus 10% platform fee)
      for (const product of products) {
        const item = dto.items.find((i) => i.productId === product.id)!;
        const subtotal = product.priceCents * item.qty;
        const sellerCut = Math.round(subtotal * 0.9);
        const sellerWallet = await tx.walletAccount.upsert({
          where: { operatorId: product.sellerId },
          update: {},
          create: { operatorId: product.sellerId },
        });
        await this.wallets.credit({
          walletId: sellerWallet.id,
          amountCents: sellerCut,
          kind: WalletTxKind.MARKETPLACE_SALE,
          description: `Venda de "${product.title}"`,
          externalRef: order.id,
          tx,
        });
      }

      // 6. Mark products SOLD
      await tx.product.updateMany({
        where: { id: { in: productIds } },
        data: { status: ProductStatus.SOLD },
      });

      return order;
    });
  }

  async listMyOrders(userId: string) {
    const buyer = await this.requireOperator(userId);
    return this.prisma.order.findMany({
      where: { buyerId: buyer.id },
      include: {
        items: { include: { product: { select: { title: true, photoUrls: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOrder(userId: string, id: string) {
    const buyer = await this.requireOperator(userId);
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: { include: { product: true } } },
    });
    if (!order) throw new NotFoundException('Order not found.');
    if (order.buyerId !== buyer.id) {
      throw new ForbiddenException('Not your order.');
    }
    return order;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private async requireOperator(userId: string) {
    const op = await this.prisma.operator.findUnique({ where: { userId } });
    if (!op) throw new NotFoundException('No operator profile for this user.');
    return op;
  }
}
