import { Injectable } from '@nestjs/common';
import type { Prisma, Squad, SquadMember } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';

export type SquadWithMembers = Squad & {
  members: (SquadMember & { operator: { id: string; callsign: string } })[];
};

@Injectable()
export class SquadsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Squad | null> {
    return this.prisma.squad.findUnique({ where: { id } });
  }

  findByIdWithMembers(id: string): Promise<SquadWithMembers | null> {
    return this.prisma.squad.findUnique({
      where: { id },
      include: {
        members: {
          orderBy: { joinedAt: 'asc' },
          include: { operator: { select: { id: true, callsign: true } } },
        },
      },
    });
  }

  findByTeamAndName(teamId: string, name: string): Promise<Squad | null> {
    return this.prisma.squad.findUnique({ where: { teamId_name: { teamId, name } } });
  }

  listByTeamWithMembers(teamId: string): Promise<SquadWithMembers[]> {
    return this.prisma.squad.findMany({
      where: { teamId },
      orderBy: { createdAt: 'asc' },
      include: {
        members: {
          orderBy: { joinedAt: 'asc' },
          include: { operator: { select: { id: true, callsign: true } } },
        },
      },
    });
  }

  create(data: Prisma.SquadUncheckedCreateInput): Promise<Squad> {
    return this.prisma.squad.create({ data });
  }

  updateById(id: string, data: Prisma.SquadUpdateInput): Promise<Squad> {
    return this.prisma.squad.update({ where: { id }, data });
  }

  deleteById(id: string): Promise<Squad> {
    return this.prisma.squad.delete({ where: { id } });
  }

  // ─── Members ─────────────────────────────────────────────────────────────

  findMember(squadId: string, operatorId: string): Promise<SquadMember | null> {
    return this.prisma.squadMember.findUnique({
      where: { squadId_operatorId: { squadId, operatorId } },
    });
  }

  /**
   * Looks up an active membership for `operatorId` across every squad of the
   * given event. Used to enforce the "one squad per operator per event" rule.
   */
  findActiveMembershipInEvent(eventId: string, operatorId: string): Promise<SquadMember | null> {
    return this.prisma.squadMember.findFirst({
      where: {
        operatorId,
        squad: { team: { eventId } },
      },
    });
  }

  createMember(squadId: string, operatorId: string): Promise<SquadMember> {
    return this.prisma.squadMember.create({ data: { squadId, operatorId } });
  }

  deleteMember(squadId: string, operatorId: string): Promise<SquadMember> {
    return this.prisma.squadMember.delete({
      where: { squadId_operatorId: { squadId, operatorId } },
    });
  }
}
