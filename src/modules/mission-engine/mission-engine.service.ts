import { Injectable, Logger } from '@nestjs/common';
import {
  type Mission,
  type MissionProgress,
  MissionProgressState,
  MissionType,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import {
  type CaptureLikeProgress,
  MISSION_PROGRESS_CHANNEL,
  type MissionProgressJob,
  type MissionProgressUpdate,
} from './dto/mission-engine.dto';

/**
 * Loads a position's relevant missions, evaluates each rule, upserts
 * mission_progress, and fans out notifications via Redis pub/sub.
 *
 * The engine is stateless across positions — every persistent piece is in
 * mission_progress. PostGIS does the spatial heavy lifting (ST_Covers on
 * boundary_geo, GIST-indexed by zones migration 1.11).
 */
@Injectable()
export class MissionEngineService {
  private readonly logger = new Logger(MissionEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async processPosition(job: MissionProgressJob): Promise<void> {
    const missions = await this.prisma.mission.findMany({
      where: {
        eventId: job.eventId,
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      },
    });

    if (missions.length === 0) {
      return;
    }

    // Resolve "is this position inside the relevant zone" once per zone, so a
    // batch with N spatial missions sharing the same zone runs a single
    // spatial query.
    const zoneIds = Array.from(
      new Set(missions.filter((m) => m.zoneId !== null).map((m) => m.zoneId as string)),
    );
    const insideByZone = await this.computeZoneContainment(zoneIds, job.lat, job.lon);

    const recordedAt = new Date(job.recordedAt);

    for (const mission of missions) {
      const decision = this.evaluate(mission, insideByZone, recordedAt);
      if (!decision) continue; // SQUAD/FACTION today; skip silently

      const updated = await this.upsertProgress(mission.id, job.operatorId, decision);
      await this.publishUpdate({
        missionId: mission.id,
        operatorId: job.operatorId,
        type: mission.type,
        state: updated.state,
        progress: updated.progress,
        completedAt: updated.completedAt ? updated.completedAt.toISOString() : null,
      });
    }
  }

  // ─── Rule evaluation per type ───────────────────────────────────────────

  /**
   * Returns the new state + progress to persist. Returning `null` means
   * "engine has no opinion right now" — leaves the row untouched (no upsert,
   * no notification). Used for SQUAD/FACTION until ranking lands.
   */
  private evaluate(
    mission: Mission,
    insideByZone: ReadonlyMap<string, boolean>,
    recordedAt: Date,
  ): MissionDecision | null {
    switch (mission.type) {
      case MissionType.CHECKPOINT: {
        if (!mission.zoneId) return null;
        const inside = insideByZone.get(mission.zoneId) ?? false;
        if (!inside) return null;
        return {
          state: MissionProgressState.COMPLETED,
          progress: {},
          completedAt: recordedAt,
        };
      }

      case MissionType.CAPTURE:
      case MissionType.HOLD:
      case MissionType.DEFEND: {
        if (!mission.zoneId) return null;
        const inside = insideByZone.get(mission.zoneId) ?? false;
        const config = mission.config as { thresholdSeconds?: number; durationSeconds?: number };
        const target = config.thresholdSeconds ?? config.durationSeconds ?? 0;
        return {
          state: MissionProgressState.IN_PROGRESS,
          // Final state computed during upsert (needs old progress).
          accumulator: { kind: 'cumulative-time', inside, recordedAt, target },
        };
      }

      case MissionType.TIME: {
        const config = mission.config as { windowStart: string; windowEnd: string };
        const start = new Date(config.windowStart);
        const end = new Date(config.windowEnd);
        if (recordedAt < start || recordedAt > end) return null;

        // If the mission also has a zone, position must be inside it.
        if (mission.zoneId) {
          const inside = insideByZone.get(mission.zoneId) ?? false;
          if (!inside) return null;
        }
        return {
          state: MissionProgressState.COMPLETED,
          progress: { firstHitAt: recordedAt.toISOString() },
          completedAt: recordedAt,
        };
      }

      // TODO(1.15 ranking): aggregate per squad/team using leaderboards.
      case MissionType.SQUAD:
      case MissionType.FACTION:
        this.logger.debug({ missionId: mission.id, type: mission.type }, 'skipping (deferred)');
        return null;

      default: {
        // Exhaustiveness — TS will flag this if a new MissionType is added.
        const exhaustive: never = mission.type;
        this.logger.warn({ unknown: exhaustive }, 'unknown mission type');
        return null;
      }
    }
  }

  // ─── DB ────────────────────────────────────────────────────────────────

  private async upsertProgress(
    missionId: string,
    operatorId: string,
    decision: MissionDecision,
  ): Promise<MissionProgress> {
    const existing = await this.prisma.missionProgress.findUnique({
      where: { missionId_operatorId: { missionId, operatorId } },
    });

    if (decision.accumulator) {
      // Cumulative-time path (CAPTURE / HOLD / DEFEND).
      const previousProgress = (existing?.progress ?? null) as CaptureLikeProgress | null;
      const previousAccumulated = previousProgress?.secondsAccumulated ?? 0;
      const previousInsideAt = previousProgress?.lastInsideAt
        ? new Date(previousProgress.lastInsideAt)
        : null;

      let secondsAccumulated = previousAccumulated;
      if (decision.accumulator.inside) {
        if (previousInsideAt) {
          const delta =
            (decision.accumulator.recordedAt.getTime() - previousInsideAt.getTime()) / 1000;
          if (delta > 0) {
            secondsAccumulated += delta;
          }
        }
      }

      const lastInsideAt = decision.accumulator.inside
        ? decision.accumulator.recordedAt.toISOString()
        : null;

      const reachedTarget = secondsAccumulated >= decision.accumulator.target;
      const newState = reachedTarget
        ? MissionProgressState.COMPLETED
        : MissionProgressState.IN_PROGRESS;
      const completedAt = reachedTarget
        ? (existing?.completedAt ?? decision.accumulator.recordedAt)
        : null;

      const newProgress: CaptureLikeProgress = { secondsAccumulated, lastInsideAt };

      // Once COMPLETED, stay COMPLETED — never regress when operator leaves.
      const finalState =
        existing?.state === MissionProgressState.COMPLETED
          ? MissionProgressState.COMPLETED
          : newState;
      const finalCompletedAt = existing?.completedAt ?? (reachedTarget ? completedAt : null);

      const progressJson = newProgress as unknown as Prisma.InputJsonValue;
      return this.prisma.missionProgress.upsert({
        where: { missionId_operatorId: { missionId, operatorId } },
        create: {
          missionId,
          operatorId,
          state: finalState,
          progress: progressJson,
          completedAt: finalCompletedAt ?? null,
        },
        update: {
          state: finalState,
          progress: progressJson,
          completedAt: finalCompletedAt ?? null,
        },
      });
    }

    // Discrete COMPLETED (CHECKPOINT, TIME).
    if (existing?.state === MissionProgressState.COMPLETED) {
      return existing;
    }
    const discreteProgress = (decision.progress ?? {}) as Prisma.InputJsonValue;
    return this.prisma.missionProgress.upsert({
      where: { missionId_operatorId: { missionId, operatorId } },
      create: {
        missionId,
        operatorId,
        state: decision.state,
        progress: discreteProgress,
        completedAt: decision.completedAt ?? null,
      },
      update: {
        state: decision.state,
        progress: discreteProgress,
        completedAt: decision.completedAt ?? null,
      },
    });
  }

  // ─── PostGIS ───────────────────────────────────────────────────────────

  private async computeZoneContainment(
    zoneIds: string[],
    lat: number,
    lon: number,
  ): Promise<Map<string, boolean>> {
    if (zoneIds.length === 0) return new Map();

    // ST_Covers on geography handles the great-circle case correctly. The GIST
    // index from zones migration (1.11) makes this fast even at scale.
    // Prisma.join builds a parameterized IN list; never interpolate UUIDs by hand.
    const rows = await this.prisma.$queryRaw<{ id: string; inside: boolean }[]>`
      SELECT
        id,
        ST_Covers(boundary_geo, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography) AS inside
      FROM zones
      WHERE id IN (${Prisma.join(zoneIds.map((id) => Prisma.sql`${id}::uuid`))})
    `;

    const map = new Map<string, boolean>();
    for (const row of rows) {
      map.set(row.id, row.inside);
    }
    return map;
  }

  // ─── Pub/sub fan-out ───────────────────────────────────────────────────

  private async publishUpdate(update: MissionProgressUpdate): Promise<void> {
    try {
      await this.redis.getClient().publish(MISSION_PROGRESS_CHANNEL, JSON.stringify(update));
    } catch (err) {
      this.logger.warn(
        { missionId: update.missionId, error: err instanceof Error ? err.message : err },
        'failed to publish mission progress update',
      );
    }
  }
}

interface MissionDecision {
  /** Final state to write OR `IN_PROGRESS` placeholder when accumulator is set. */
  state: MissionProgressState;
  /** Free-form progress payload to write directly. Ignored if `accumulator` is set. */
  progress?: unknown;
  /** Optional completedAt timestamp. */
  completedAt?: Date;
  /**
   * For cumulative-time missions (CAPTURE / HOLD / DEFEND), the upsert needs
   * the previous progress to compute `secondsAccumulated`. Marker tells the
   * upsert to take the cumulative path.
   */
  accumulator?: {
    kind: 'cumulative-time';
    inside: boolean;
    recordedAt: Date;
    target: number;
  };
}
