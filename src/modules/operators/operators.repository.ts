import { Injectable } from '@nestjs/common';
import type { Operator, Prisma } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';

@Injectable()
export class OperatorsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Operator | null> {
    return this.prisma.operator.findUnique({ where: { id } });
  }

  findByUserId(userId: string): Promise<Operator | null> {
    return this.prisma.operator.findUnique({ where: { userId } });
  }

  findByCallsign(callsign: string): Promise<Operator | null> {
    return this.prisma.operator.findUnique({ where: { callsign } });
  }

  create(data: Prisma.OperatorUncheckedCreateInput): Promise<Operator> {
    return this.prisma.operator.create({ data });
  }

  updateById(id: string, data: Prisma.OperatorUpdateInput): Promise<Operator> {
    return this.prisma.operator.update({ where: { id }, data });
  }
}
