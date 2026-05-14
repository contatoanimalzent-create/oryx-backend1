import { Injectable } from '@nestjs/common';
import type { Prisma, Zone } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';

@Injectable()
export class ZonesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Zone | null> {
    return this.prisma.zone.findUnique({ where: { id } });
  }

  findByEventAndName(eventId: string, name: string): Promise<Zone | null> {
    return this.prisma.zone.findUnique({ where: { eventId_name: { eventId, name } } });
  }

  listByEvent(eventId: string): Promise<Zone[]> {
    return this.prisma.zone.findMany({
      where: { eventId },
      orderBy: { createdAt: 'asc' },
    });
  }

  create(data: Prisma.ZoneUncheckedCreateInput): Promise<Zone> {
    return this.prisma.zone.create({ data });
  }

  updateById(id: string, data: Prisma.ZoneUpdateInput): Promise<Zone> {
    return this.prisma.zone.update({ where: { id }, data });
  }

  deleteById(id: string): Promise<Zone> {
    return this.prisma.zone.delete({ where: { id } });
  }
}
