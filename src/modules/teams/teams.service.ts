import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { type Event, EventStatus, type Team } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import type { CreateTeamDto, TeamView, UpdateTeamDto } from './dto/teams.dto';
import { TeamsRepository } from './teams.repository';

@Injectable()
export class TeamsService {
  constructor(
    private readonly repository: TeamsRepository,
    // Direct prisma access to load the parent event without pulling EventsModule.
    // This module owns its own read of the parent's lifecycle status.
    private readonly prisma: PrismaService,
  ) {}

  async createForEvent(eventId: string, dto: CreateTeamDto): Promise<TeamView> {
    const event = await this.requireEvent(eventId);
    if (event.status === EventStatus.ENDED) {
      throw new ConflictException('Cannot create teams in ENDED events.');
    }

    const collision = await this.repository.findByEventAndName(eventId, dto.name);
    if (collision) {
      throw new ConflictException(`Team "${dto.name}" already exists in this event.`);
    }

    const created = await this.repository.create({
      eventId,
      name: dto.name,
      color: dto.color,
      emblem: dto.emblem,
      description: dto.description,
    });
    return this.toView(created);
  }

  async listByEvent(eventId: string): Promise<TeamView[]> {
    await this.requireEvent(eventId);
    const rows = await this.repository.listByEvent(eventId);
    return rows.map((row) => this.toView(row));
  }

  async getById(id: string): Promise<TeamView> {
    const team = await this.requireTeam(id);
    return this.toView(team);
  }

  async update(id: string, dto: UpdateTeamDto): Promise<TeamView> {
    const team = await this.requireTeam(id);
    const event = await this.requireEvent(team.eventId);
    if (event.status === EventStatus.ENDED) {
      throw new ConflictException('Cannot edit teams of ENDED events.');
    }

    if (dto.name && dto.name !== team.name) {
      const collision = await this.repository.findByEventAndName(team.eventId, dto.name);
      if (collision && collision.id !== team.id) {
        throw new ConflictException(`Team "${dto.name}" already exists in this event.`);
      }
    }

    const updated = await this.repository.updateById(id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.color !== undefined ? { color: dto.color } : {}),
      ...(dto.emblem !== undefined ? { emblem: dto.emblem } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
    });
    return this.toView(updated);
  }

  async remove(id: string): Promise<void> {
    const team = await this.requireTeam(id);
    const event = await this.requireEvent(team.eventId);
    if (event.status !== EventStatus.DRAFT) {
      throw new ConflictException(
        `Cannot delete teams in event with status ${event.status}; only DRAFT allows deletion.`,
      );
    }
    await this.repository.deleteById(id);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async requireEvent(eventId: string): Promise<Event> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Event not found.');
    }
    return event;
  }

  private async requireTeam(id: string): Promise<Team> {
    const team = await this.repository.findById(id);
    if (!team) {
      throw new NotFoundException('Team not found.');
    }
    return team;
  }

  private toView(t: Team): TeamView {
    return {
      id: t.id,
      eventId: t.eventId,
      name: t.name,
      color: t.color,
      emblem: t.emblem,
      description: t.description,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }
}
