import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { type Event, EventStatus } from '@prisma/client';

import type {
  CreateEventDto,
  EventListQuery,
  EventView,
  GeoPolygon,
  UpdateEventDto,
} from './dto/events.dto';
import { EventsRepository } from './events.repository';

@Injectable()
export class EventsService {
  constructor(private readonly repository: EventsRepository) {}

  async create(adminId: string, dto: CreateEventDto): Promise<EventView> {
    const created = await this.repository.create({
      name: dto.name,
      description: dto.description,
      mode: dto.mode,
      operationalArea: dto.operationalArea,
      createdById: adminId,
    });
    return this.toView(created);
  }

  async list(query: EventListQuery): Promise<EventView[]> {
    const rows = await this.repository.list(query);
    return rows.map((row) => this.toView(row));
  }

  async getById(id: string): Promise<EventView> {
    const event = await this.requireById(id);
    return this.toView(event);
  }

  /**
   * Generic PATCH. Allowed only while the event is in DRAFT — once ACTIVE,
   * the operational footprint is locked (operators in field rely on the
   * area/mode shown when they joined).
   */
  async update(id: string, dto: UpdateEventDto): Promise<EventView> {
    const event = await this.requireById(id);
    if (event.status !== EventStatus.DRAFT) {
      throw new ConflictException(
        `Cannot edit event in status ${event.status}; only DRAFT is mutable.`,
      );
    }

    const updated = await this.repository.updateById(id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.mode !== undefined ? { mode: dto.mode } : {}),
      ...(dto.operationalArea !== undefined ? { operationalArea: dto.operationalArea } : {}),
    });
    return this.toView(updated);
  }

  async activate(id: string): Promise<EventView> {
    const event = await this.requireById(id);
    if (event.status !== EventStatus.DRAFT) {
      throw new ConflictException(
        `Cannot activate event in status ${event.status}; only DRAFT can be activated.`,
      );
    }
    const updated = await this.repository.updateById(id, {
      status: EventStatus.ACTIVE,
      startsAt: new Date(),
    });
    return this.toView(updated);
  }

  async end(id: string): Promise<EventView> {
    const event = await this.requireById(id);
    if (event.status !== EventStatus.ACTIVE) {
      throw new ConflictException(
        `Cannot end event in status ${event.status}; only ACTIVE can be ended.`,
      );
    }
    const updated = await this.repository.updateById(id, {
      status: EventStatus.ENDED,
      endsAt: new Date(),
    });
    return this.toView(updated);
  }

  async remove(id: string): Promise<void> {
    const event = await this.requireById(id);
    if (event.status !== EventStatus.DRAFT) {
      throw new ConflictException(
        `Cannot delete event in status ${event.status}; only DRAFT can be deleted.`,
      );
    }
    await this.repository.deleteById(id);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async requireById(id: string): Promise<Event> {
    const event = await this.repository.findById(id);
    if (!event) {
      throw new NotFoundException('Event not found.');
    }
    return event;
  }

  private toView(e: Event): EventView {
    return {
      id: e.id,
      name: e.name,
      description: e.description,
      mode: e.mode,
      status: e.status,
      operationalArea: e.operationalArea as unknown as GeoPolygon,
      startsAt: e.startsAt ? e.startsAt.toISOString() : null,
      endsAt: e.endsAt ? e.endsAt.toISOString() : null,
      createdById: e.createdById,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }
}
