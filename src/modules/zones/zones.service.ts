import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { type Event, EventStatus, type Zone } from '@prisma/client';

import type { GeoPolygon } from '../../shared/geo/geo.dto';
import { PrismaService } from '../../shared/database/prisma.service';
import type { CreateZoneDto, UpdateZoneDto, ZoneView } from './dto/zones.dto';
import { ZonesRepository } from './zones.repository';

@Injectable()
export class ZonesService {
  constructor(
    private readonly repository: ZonesRepository,
    private readonly prisma: PrismaService,
  ) {}

  async createForEvent(eventId: string, dto: CreateZoneDto): Promise<ZoneView> {
    const event = await this.requireEvent(eventId);
    if (event.status === EventStatus.ENDED) {
      throw new ConflictException('Cannot create zones in ENDED events.');
    }

    const collision = await this.repository.findByEventAndName(eventId, dto.name);
    if (collision) {
      throw new ConflictException(`Zone "${dto.name}" already exists in this event.`);
    }

    const created = await this.repository.create({
      eventId,
      name: dto.name,
      description: dto.description,
      boundary: dto.boundary,
    });
    return this.toView(created);
  }

  async listByEvent(eventId: string): Promise<ZoneView[]> {
    await this.requireEvent(eventId);
    const rows = await this.repository.listByEvent(eventId);
    return rows.map((row) => this.toView(row));
  }

  async getById(id: string): Promise<ZoneView> {
    const zone = await this.requireZone(id);
    return this.toView(zone);
  }

  async update(id: string, dto: UpdateZoneDto): Promise<ZoneView> {
    const zone = await this.requireZone(id);
    const event = await this.requireEvent(zone.eventId);
    if (event.status === EventStatus.ENDED) {
      throw new ConflictException('Cannot edit zones of ENDED events.');
    }

    if (dto.name && dto.name !== zone.name) {
      const collision = await this.repository.findByEventAndName(zone.eventId, dto.name);
      if (collision && collision.id !== zone.id) {
        throw new ConflictException(`Zone "${dto.name}" already exists in this event.`);
      }
    }

    const updated = await this.repository.updateById(id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.boundary !== undefined ? { boundary: dto.boundary } : {}),
    });
    return this.toView(updated);
  }

  async remove(id: string): Promise<void> {
    const zone = await this.requireZone(id);
    const event = await this.requireEvent(zone.eventId);
    if (event.status !== EventStatus.DRAFT) {
      throw new ConflictException(
        `Cannot delete zones in event with status ${event.status}; only DRAFT allows deletion.`,
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

  private async requireZone(id: string): Promise<Zone> {
    const zone = await this.repository.findById(id);
    if (!zone) {
      throw new NotFoundException('Zone not found.');
    }
    return zone;
  }

  private toView(z: Zone): ZoneView {
    return {
      id: z.id,
      eventId: z.eventId,
      name: z.name,
      description: z.description,
      boundary: z.boundary as unknown as GeoPolygon,
      createdAt: z.createdAt.toISOString(),
      updatedAt: z.updatedAt.toISOString(),
    };
  }
}
