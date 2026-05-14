import { Injectable } from '@nestjs/common';
import type { Event, EventMode, EventStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';

@Injectable()
export class EventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Event | null> {
    return this.prisma.event.findUnique({ where: { id } });
  }

  list(filter: { status?: EventStatus; mode?: EventMode }): Promise<Event[]> {
    return this.prisma.event.findMany({
      where: {
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.mode ? { mode: filter.mode } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(data: Prisma.EventUncheckedCreateInput): Promise<Event> {
    return this.prisma.event.create({ data });
  }

  updateById(id: string, data: Prisma.EventUpdateInput): Promise<Event> {
    return this.prisma.event.update({ where: { id }, data });
  }

  deleteById(id: string): Promise<Event> {
    return this.prisma.event.delete({ where: { id } });
  }
}
