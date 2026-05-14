import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { type Event, EventStatus, type Squad, SquadStatus } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import type { AddMemberDto, CreateSquadDto, SquadView, UpdateSquadDto } from './dto/squads.dto';
import { SquadsRepository, type SquadWithMembers } from './squads.repository';

@Injectable()
export class SquadsService {
  constructor(
    private readonly repository: SquadsRepository,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Squad CRUD ──────────────────────────────────────────────────────────

  async createForTeam(teamId: string, dto: CreateSquadDto): Promise<SquadView> {
    const event = await this.requireEventForTeam(teamId);
    if (event.status === EventStatus.ENDED) {
      throw new ConflictException('Cannot create squads in ENDED events.');
    }

    const collision = await this.repository.findByTeamAndName(teamId, dto.name);
    if (collision) {
      throw new ConflictException(`Squad "${dto.name}" already exists in this team.`);
    }

    const created = await this.repository.create({
      teamId,
      name: dto.name,
      description: dto.description,
    });
    return this.toView({ ...created, members: [] });
  }

  async listByTeam(teamId: string): Promise<SquadView[]> {
    await this.requireEventForTeam(teamId);
    const rows = await this.repository.listByTeamWithMembers(teamId);
    return rows.map((row) => this.toView(row));
  }

  async getById(id: string): Promise<SquadView> {
    const squad = await this.repository.findByIdWithMembers(id);
    if (!squad) {
      throw new NotFoundException('Squad not found.');
    }
    return this.toView(squad);
  }

  async update(id: string, dto: UpdateSquadDto): Promise<SquadView> {
    const squad = await this.requireSquad(id);
    const event = await this.requireEventForTeam(squad.teamId);
    if (event.status === EventStatus.ENDED) {
      throw new ConflictException('Cannot edit squads of ENDED events.');
    }

    if (dto.status !== undefined) {
      this.assertStatusTransition(squad.status, dto.status);
    }

    if (dto.name && dto.name !== squad.name) {
      const collision = await this.repository.findByTeamAndName(squad.teamId, dto.name);
      if (collision && collision.id !== squad.id) {
        throw new ConflictException(`Squad "${dto.name}" already exists in this team.`);
      }
    }

    if (dto.leaderId !== undefined && dto.leaderId !== null) {
      const member = await this.repository.findMember(squad.id, dto.leaderId);
      if (!member) {
        throw new ConflictException('Leader must be a member of the squad.');
      }
    }

    const updated = await this.repository.updateById(id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.leaderId !== undefined
        ? dto.leaderId === null
          ? { leader: { disconnect: true } }
          : { leader: { connect: { id: dto.leaderId } } }
        : {}),
    });
    return this.getById(updated.id);
  }

  async remove(id: string): Promise<void> {
    const squad = await this.requireSquad(id);
    const event = await this.requireEventForTeam(squad.teamId);
    if (event.status !== EventStatus.DRAFT) {
      throw new ConflictException(
        `Cannot delete squads in event with status ${event.status}; only DRAFT allows deletion.`,
      );
    }
    await this.repository.deleteById(id);
  }

  // ─── Members ─────────────────────────────────────────────────────────────

  async addMember(squadId: string, dto: AddMemberDto): Promise<SquadView> {
    const squad = await this.requireSquad(squadId);
    if (squad.status === SquadStatus.DISBANDED) {
      throw new ConflictException('Cannot add members to a DISBANDED squad.');
    }

    const event = await this.requireEventForTeam(squad.teamId);
    if (event.status === EventStatus.ENDED) {
      throw new ConflictException('Cannot add members in ENDED events.');
    }

    const operator = await this.prisma.operator.findUnique({ where: { id: dto.operatorId } });
    if (!operator) {
      throw new NotFoundException('Operator not found.');
    }

    const existingInEvent = await this.repository.findActiveMembershipInEvent(
      event.id,
      dto.operatorId,
    );
    if (existingInEvent) {
      throw new ConflictException('Operator is already a member of another squad in this event.');
    }

    const dup = await this.repository.findMember(squadId, dto.operatorId);
    if (dup) {
      throw new ConflictException('Operator is already a member of this squad.');
    }

    await this.repository.createMember(squadId, dto.operatorId);
    return this.getById(squadId);
  }

  async removeMember(squadId: string, operatorId: string): Promise<void> {
    const squad = await this.requireSquad(squadId);
    const event = await this.requireEventForTeam(squad.teamId);
    if (event.status === EventStatus.ENDED) {
      throw new ConflictException('Cannot remove members in ENDED events.');
    }

    const member = await this.repository.findMember(squadId, operatorId);
    if (!member) {
      throw new NotFoundException('Operator is not a member of this squad.');
    }

    // If the removed operator was the leader, clear leaderId — leaders must be
    // members. Done in a transaction so we never leave an invalid state.
    const isLeader = squad.leaderId === operatorId;
    await this.prisma.$transaction(async (tx) => {
      await tx.squadMember.delete({
        where: { squadId_operatorId: { squadId, operatorId } },
      });
      if (isLeader) {
        await tx.squad.update({ where: { id: squadId }, data: { leaderId: null } });
      }
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  /**
   * DISBANDED is terminal. Any other ACTIVE↔INACTIVE transition is allowed.
   */
  private assertStatusTransition(from: SquadStatus, to: SquadStatus): void {
    if (from === to) return;
    if (from === SquadStatus.DISBANDED) {
      throw new ConflictException('DISBANDED squads cannot transition to other statuses.');
    }
  }

  private async requireSquad(id: string): Promise<Squad> {
    const squad = await this.repository.findById(id);
    if (!squad) {
      throw new NotFoundException('Squad not found.');
    }
    return squad;
  }

  private async requireEventForTeam(teamId: string): Promise<Event> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: { event: true },
    });
    if (!team) {
      throw new NotFoundException('Team not found.');
    }
    return team.event;
  }

  private toView(squad: SquadWithMembers): SquadView {
    return {
      id: squad.id,
      teamId: squad.teamId,
      name: squad.name,
      description: squad.description,
      leaderId: squad.leaderId,
      status: squad.status,
      createdAt: squad.createdAt.toISOString(),
      updatedAt: squad.updatedAt.toISOString(),
      members: squad.members.map((m) => ({
        operatorId: m.operatorId,
        callsign: m.operator.callsign,
        joinedAt: m.joinedAt.toISOString(),
      })),
    };
  }
}
