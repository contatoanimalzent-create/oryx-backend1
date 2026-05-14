import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { type Event, EventStatus, type Mission } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import {
  type CreateMissionDto,
  type MissionListQuery,
  type MissionView,
  SPATIAL_MISSION_TYPES,
  type UpdateMissionDto,
} from './dto/missions.dto';
import { MissionsRepository } from './missions.repository';

@Injectable()
export class MissionsService {
  constructor(
    private readonly repository: MissionsRepository,
    private readonly prisma: PrismaService,
  ) {}

  async createForEvent(eventId: string, dto: CreateMissionDto): Promise<MissionView> {
    const event = await this.requireEvent(eventId);
    if (event.status === EventStatus.ENDED) {
      throw new ConflictException('Cannot create missions in ENDED events.');
    }

    const collision = await this.repository.findByEventAndName(eventId, dto.name);
    if (collision) {
      throw new ConflictException(`Mission "${dto.name}" already exists in this event.`);
    }

    // Spatial types REQUIRE a zone. Zod already enforces this for CAPTURE/
    // DEFEND/HOLD/CHECKPOINT. Re-check at the boundary in case the schema
    // is bypassed (e.g. service used by another module later).
    const zoneId = 'zoneId' in dto ? dto.zoneId : undefined;
    if (SPATIAL_MISSION_TYPES.includes(dto.type) && !zoneId) {
      throw new ConflictException(`Mission type ${dto.type} requires a zoneId.`);
    }

    if (zoneId) {
      const zone = await this.prisma.zone.findUnique({ where: { id: zoneId } });
      if (!zone) {
        throw new NotFoundException('Zone not found.');
      }
      if (zone.eventId !== eventId) {
        throw new ConflictException('Zone does not belong to this event.');
      }
    }

    const created = await this.repository.create({
      eventId,
      type: dto.type,
      name: dto.name,
      description: dto.description,
      zoneId: zoneId ?? null,
      config: dto.config,
      pointsReward: dto.pointsReward,
    });
    return this.toView(created);
  }

  async listByEvent(eventId: string, query: MissionListQuery): Promise<MissionView[]> {
    await this.requireEvent(eventId);
    const rows = await this.repository.listByEvent({ eventId, ...query });
    return rows.map((row) => this.toView(row));
  }

  async getById(id: string): Promise<MissionView> {
    const mission = await this.requireMission(id);
    return this.toView(mission);
  }

  async update(id: string, dto: UpdateMissionDto): Promise<MissionView> {
    const mission = await this.requireMission(id);
    const event = await this.requireEvent(mission.eventId);
    if (event.status === EventStatus.ENDED) {
      throw new ConflictException('Cannot edit missions of ENDED events.');
    }

    if (dto.name && dto.name !== mission.name) {
      const collision = await this.repository.findByEventAndName(mission.eventId, dto.name);
      if (collision && collision.id !== mission.id) {
        throw new ConflictException(`Mission "${dto.name}" already exists in this event.`);
      }
    }

    const updated = await this.repository.updateById(id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.pointsReward !== undefined ? { pointsReward: dto.pointsReward } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    });
    return this.toView(updated);
  }

  async remove(id: string): Promise<void> {
    const mission = await this.requireMission(id);
    const event = await this.requireEvent(mission.eventId);
    if (event.status !== EventStatus.DRAFT) {
      throw new ConflictException(
        `Cannot delete missions in event with status ${event.status}; only DRAFT allows deletion.`,
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

  private async requireMission(id: string): Promise<Mission> {
    const mission = await this.repository.findById(id);
    if (!mission) {
      throw new NotFoundException('Mission not found.');
    }
    return mission;
  }

  private toView(m: Mission): MissionView {
    return {
      id: m.id,
      eventId: m.eventId,
      type: m.type,
      name: m.name,
      description: m.description,
      zoneId: m.zoneId,
      config: m.config,
      pointsReward: m.pointsReward,
      status: m.status,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    };
  }
}
