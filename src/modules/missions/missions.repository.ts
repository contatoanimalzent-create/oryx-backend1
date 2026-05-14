import { Injectable } from '@nestjs/common';
import type { Mission, MissionStatus, MissionType, Prisma } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';

@Injectable()
export class MissionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Mission | null> {
    return this.prisma.mission.findUnique({ where: { id } });
  }

  findByEventAndName(eventId: string, name: string): Promise<Mission | null> {
    return this.prisma.mission.findUnique({
      where: { eventId_name: { eventId, name } },
    });
  }

  listByEvent(filter: {
    eventId: string;
    type?: MissionType;
    status?: MissionStatus;
  }): Promise<Mission[]> {
    return this.prisma.mission.findMany({
      where: {
        eventId: filter.eventId,
        ...(filter.type ? { type: filter.type } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  create(data: Prisma.MissionUncheckedCreateInput): Promise<Mission> {
    return this.prisma.mission.create({ data });
  }

  updateById(id: string, data: Prisma.MissionUpdateInput): Promise<Mission> {
    return this.prisma.mission.update({ where: { id }, data });
  }

  deleteById(id: string): Promise<Mission> {
    return this.prisma.mission.delete({ where: { id } });
  }
}
