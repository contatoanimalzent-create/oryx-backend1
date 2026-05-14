import { InjectQueue } from '@nestjs/bullmq';
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventStatus, SquadStatus } from '@prisma/client';
import type { Queue } from 'bullmq';

import { PrismaService } from '../../shared/database/prisma.service';
import {
  type IngestPositionDto,
  POSITIONS_QUEUE_NAME,
  type PositionIngestJob,
} from './dto/positions.dto';

@Injectable()
export class PositionsService {
  private readonly logger = new Logger(PositionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(POSITIONS_QUEUE_NAME) private readonly queue: Queue<PositionIngestJob>,
  ) {}

  /**
   * Accepts a position from `userId` (derived from JWT — never trust the body).
   * Validates that the user has an Operator profile in an ACTIVE squad of an
   * ACTIVE event whose id matches `dto.eventId` (anti-spoofing across events),
   * then enqueues for the worker.
   */
  async ingest(userId: string, dto: IngestPositionDto): Promise<{ clientEventId: string }> {
    const operator = await this.prisma.operator.findUnique({ where: { userId } });
    if (!operator) {
      throw new NotFoundException(
        'No operator profile for this user — create one before sending positions.',
      );
    }

    const membership = await this.prisma.squadMember.findFirst({
      where: { operatorId: operator.id },
      include: { squad: { include: { team: { include: { event: true } } } } },
    });
    if (!membership) {
      throw new ConflictException('Operator has no squad membership.');
    }
    if (membership.squad.status !== SquadStatus.ACTIVE) {
      throw new ConflictException(
        `Squad is in status ${membership.squad.status}; only ACTIVE squads can publish positions.`,
      );
    }
    if (membership.squad.team.event.status !== EventStatus.ACTIVE) {
      throw new ConflictException(
        `Event is in status ${membership.squad.team.event.status}; only ACTIVE events accept positions.`,
      );
    }
    if (membership.squad.team.event.id !== dto.eventId) {
      throw new ConflictException("eventId in payload does not match the operator's active event.");
    }

    const job: PositionIngestJob = {
      ...dto,
      operatorId: operator.id,
      receivedAt: new Date().toISOString(),
    };

    // jobId = clientEventId so BullMQ deduplicates duplicate enqueues even
    // before the worker checks Redis. The Redis SETNX in the processor is the
    // definitive guard (covers re-enqueues across queue resets).
    await this.queue.add('ingest', job, {
      jobId: dto.clientEventId,
      removeOnComplete: 1_000,
      removeOnFail: 1_000,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1_000 },
    });

    this.logger.debug(
      { operatorId: operator.id, eventId: dto.eventId, clientEventId: dto.clientEventId },
      'position enqueued',
    );

    return { clientEventId: dto.clientEventId };
  }
}
