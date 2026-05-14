import { Injectable } from '@nestjs/common';
import type { Prisma, Team } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';

@Injectable()
export class TeamsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Team | null> {
    return this.prisma.team.findUnique({ where: { id } });
  }

  findByEventAndName(eventId: string, name: string): Promise<Team | null> {
    return this.prisma.team.findUnique({
      where: { eventId_name: { eventId, name } },
    });
  }

  listByEvent(eventId: string): Promise<Team[]> {
    return this.prisma.team.findMany({
      where: { eventId },
      orderBy: { createdAt: 'asc' },
    });
  }

  create(data: Prisma.TeamUncheckedCreateInput): Promise<Team> {
    return this.prisma.team.create({ data });
  }

  updateById(id: string, data: Prisma.TeamUpdateInput): Promise<Team> {
    return this.prisma.team.update({ where: { id }, data });
  }

  deleteById(id: string): Promise<Team> {
    return this.prisma.team.delete({ where: { id } });
  }
}
