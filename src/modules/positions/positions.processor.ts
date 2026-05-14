import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';

import { ANTI_CHEAT_QUEUE_NAME, type AntiCheatInspectJob } from '../anti-cheat/dto/anti-cheat.dto';
import {
  MISSION_PROGRESS_QUEUE_NAME,
  type MissionProgressJob,
} from '../mission-engine/dto/mission-engine.dto';
import { PrismaService } from '../../shared/database/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import {
  type LivePositionSnapshot,
  POSITIONS_QUEUE_NAME,
  type PositionIngestJob,
} from './dto/positions.dto';

/** Server-side timestamp drift threshold. Beyond this we log and clamp. */
const MAX_DRIFT_MS = 5 * 60 * 1000;

/** Live position TTL — admin/teammates see "online" while a packet was recent. */
const LIVE_TTL_SECONDS = 60;

/** Idempotency window — second push of the same clientEventId within is a no-op. */
const DEDUP_TTL_SECONDS = 5 * 60;

@Processor(POSITIONS_QUEUE_NAME)
export class PositionsProcessor extends WorkerHost {
  private readonly logger = new Logger(PositionsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @InjectQueue(MISSION_PROGRESS_QUEUE_NAME)
    private readonly missionProgressQueue: Queue<MissionProgressJob>,
    @InjectQueue(ANTI_CHEAT_QUEUE_NAME)
    private readonly antiCheatQueue: Queue<AntiCheatInspectJob>,
  ) {
    super();
  }

  async process(job: Job<PositionIngestJob>): Promise<void> {
    const payload = job.data;

    // ─── 1. Dedup ──────────────────────────────────────────────────────────
    const dedupKey = `dedup:position:${payload.clientEventId}`;
    const acquired = await this.redis.getClient().set(dedupKey, '1', 'EX', DEDUP_TTL_SECONDS, 'NX');
    if (acquired === null) {
      this.logger.debug({ clientEventId: payload.clientEventId }, 'duplicate, skipping');
      return;
    }

    // ─── 2. Server-authoritative timestamp ─────────────────────────────────
    const recordedAt = this.adjustTimestamp(payload);

    // ─── 3. Append to position_history ─────────────────────────────────────
    await this.prisma.positionHistory.create({
      data: {
        operatorId: payload.operatorId,
        eventId: payload.eventId,
        lat: payload.lat,
        lon: payload.lon,
        accuracyM: payload.accuracyM,
        headingDeg: payload.headingDeg,
        speedMps: payload.speedMps,
        clientEventId: payload.clientEventId,
        recordedAt,
      },
    });

    // ─── 4. Update live snapshot in Redis + fan-out via pub/sub ────────────
    const snapshot: LivePositionSnapshot = {
      operatorId: payload.operatorId,
      eventId: payload.eventId,
      lat: payload.lat,
      lon: payload.lon,
      accuracyM: payload.accuracyM,
      headingDeg: payload.headingDeg,
      speedMps: payload.speedMps,
      recordedAt: recordedAt.toISOString(),
      receivedAt: payload.receivedAt,
    };
    const snapshotJson = JSON.stringify(snapshot);
    await this.redis.set(`live:position:${payload.operatorId}`, snapshotJson, LIVE_TTL_SECONDS);
    // RealtimeSubscriber (sessão 1.10) listens on `event:*:positions` and
    // forwards each message to the WebSocket room of admin clients tracking
    // this event. Publish failures are logged but never break ingestion.
    try {
      await this.redis.getClient().publish(`event:${payload.eventId}:positions`, snapshotJson);
    } catch (err) {
      this.logger.warn(
        { eventId: payload.eventId, error: err instanceof Error ? err.message : err },
        'failed to publish position to realtime channel',
      );
    }

    // Mission engine (sessão 1.13) reads server-canonical state, never the
    // mobile payload. Failures here don't roll back the live snapshot.
    try {
      await this.missionProgressQueue.add(
        'tick',
        {
          eventId: payload.eventId,
          operatorId: payload.operatorId,
          lat: payload.lat,
          lon: payload.lon,
          recordedAt: recordedAt.toISOString(),
        },
        {
          // jobId scoped to (event, operator, recordedAt) gives natural dedup
          // for accidental re-enqueues of the same tick.
          jobId: `${payload.eventId}:${payload.operatorId}:${recordedAt.getTime()}`,
          removeOnComplete: 1_000,
          removeOnFail: 1_000,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1_000 },
        },
      );
    } catch (err) {
      this.logger.warn(
        { eventId: payload.eventId, error: err instanceof Error ? err.message : err },
        'failed to enqueue mission-engine job',
      );
    }

    // Anti-cheat (sessão 1.17) inspects each new position against the previous
    // ones for the same operator/event. Independent of mission-engine — must
    // never block or roll back ingestion.
    try {
      await this.antiCheatQueue.add(
        'inspect',
        {
          eventId: payload.eventId,
          operatorId: payload.operatorId,
          lat: payload.lat,
          lon: payload.lon,
          recordedAt: recordedAt.toISOString(),
          clientSpeedMps: payload.speedMps,
          accuracyM: payload.accuracyM,
        },
        {
          // Same scoping as the mission-engine tick — different queue, so no
          // collision. BullMQ only accepts jobIds with at most two `:` so the
          // suffix that disambiguated within a shared queue is unnecessary.
          jobId: `${payload.eventId}:${payload.operatorId}:${recordedAt.getTime()}`,
          removeOnComplete: 1_000,
          removeOnFail: 1_000,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1_000 },
        },
      );
    } catch (err) {
      this.logger.warn(
        { eventId: payload.eventId, error: err instanceof Error ? err.message : err },
        'failed to enqueue anti-cheat job',
      );
    }
  }

  /**
   * If the client clock drifted more than MAX_DRIFT_MS from server time, log
   * a structured warning and clamp `recordedAt` to the receive time so
   * downstream timeline ordering stays sane. Anti-cheat (1.17) covers spatial
   * anomalies; clock-drift is its own signal handled here at ingestion.
   */
  private adjustTimestamp(payload: PositionIngestJob): Date {
    const recorded = new Date(payload.recordedAt);
    const received = new Date(payload.receivedAt);
    const drift = Math.abs(received.getTime() - recorded.getTime());
    if (drift > MAX_DRIFT_MS) {
      this.logger.warn(
        {
          operatorId: payload.operatorId,
          clientEventId: payload.clientEventId,
          driftMs: drift,
          clientRecordedAt: payload.recordedAt,
          serverReceivedAt: payload.receivedAt,
        },
        'position timestamp drift > 5min; clamping to server time',
      );
      return received;
    }
    return recorded;
  }
}
