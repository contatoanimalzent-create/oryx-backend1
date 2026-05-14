import { Injectable, Logger } from '@nestjs/common';
import {
  CheatDetector,
  CheatSeverity,
  type PositionHistory,
  Prisma,
  ReputationKind,
  ReputationReason,
  ReputationSeverity,
} from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import { ReputationService } from '../reputation/reputation.service';
import {
  type AntiCheatInspectJob,
  type DetectorHit,
  GPS_BAD_ACCURACY_M,
  GPS_CONSECUTIVE_BAD,
  GPS_SPEED_DIVERGENCE_MPS,
  JUMP_DELTA_M,
  JUMP_DT_MAX_S,
  SPEED_MAJOR_MPS,
  SPEED_MINOR_MPS,
  SPEED_SEVERE_MPS,
} from './dto/anti-cheat.dto';

/**
 * Runs the three roadmap detectors (speed-impossible, location-jump, GPS-
 * inconsistency) against each new position and persists every hit as a
 * `CheatSuspicion`. Severity ≥ MAJOR also writes a reputation PENALTY via
 * ReputationService — the hook 1.16 was designed for (`createdById = null`
 * for system-generated entries).
 *
 * The service is stateless across calls: every comparison happens against
 * `position_history` rows already written for the same operator/event.
 */
@Injectable()
export class AntiCheatService {
  private readonly logger = new Logger(AntiCheatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reputation: ReputationService,
  ) {}

  async inspectPosition(job: AntiCheatInspectJob): Promise<DetectorHit[]> {
    const recordedAt = new Date(job.recordedAt);

    // GPS_CONSECUTIVE_BAD - 1 previous fixes is enough: combined with the
    // current job they form the 3-fix window the heuristic needs. Speed/jump
    // detectors only look at the most recent one.
    const previousFixes = await this.prisma.positionHistory.findMany({
      where: {
        operatorId: job.operatorId,
        eventId: job.eventId,
        recordedAt: { lt: recordedAt },
      },
      orderBy: { recordedAt: 'desc' },
      take: GPS_CONSECUTIVE_BAD - 1,
    });

    const hits: DetectorHit[] = [];
    const previous = previousFixes[0] ?? null;
    if (previous) {
      const speedHit = this.evaluateSpeed(previous, job, recordedAt);
      if (speedHit) hits.push(speedHit);

      const jumpHit = this.evaluateJump(previous, job, recordedAt);
      if (jumpHit) hits.push(jumpHit);
    }

    const gpsHit = this.evaluateGpsInconsistency(previousFixes, job, recordedAt);
    if (gpsHit) hits.push(gpsHit);

    if (hits.length === 0) return hits;

    await Promise.all(
      hits.map((hit) =>
        this.prisma.cheatSuspicion.create({
          data: {
            operatorId: job.operatorId,
            eventId: job.eventId,
            detector: hit.detector,
            severity: hit.severity,
            evidence: hit.evidence as unknown as Prisma.InputJsonValue,
            recordedAt,
          },
        }),
      ),
    );

    for (const hit of hits) {
      const reputationSeverity = mapToReputationSeverity(hit.severity);
      if (!reputationSeverity) continue;
      try {
        await this.reputation.recordEntry(
          job.operatorId,
          {
            kind: ReputationKind.PENALTY,
            severity: reputationSeverity,
            reason: ReputationReason.CHEATING,
            eventId: job.eventId,
            note: `auto: ${hit.detector}`,
          },
          null,
        );
      } catch (err) {
        // Reputation failures must not abort the suspicion write — the audit
        // trail in cheat_suspicions stays canonical even if the score side-
        // effect is lost.
        this.logger.warn(
          {
            operatorId: job.operatorId,
            detector: hit.detector,
            error: err instanceof Error ? err.message : err,
          },
          'failed to write reputation entry from anti-cheat hit',
        );
      }
    }

    return hits;
  }

  // ─── Detectors ─────────────────────────────────────────────────────────

  private evaluateSpeed(
    previous: PositionHistory,
    job: AntiCheatInspectJob,
    recordedAt: Date,
  ): DetectorHit | null {
    const dtSeconds = (recordedAt.getTime() - previous.recordedAt.getTime()) / 1000;
    if (dtSeconds <= 0) return null;

    const deltaM = haversineMeters(previous.lat, previous.lon, job.lat, job.lon);
    const calcSpeedMps = deltaM / dtSeconds;

    let severity: CheatSeverity | null = null;
    let thresholdMps = 0;
    if (calcSpeedMps > SPEED_SEVERE_MPS) {
      severity = CheatSeverity.SEVERE;
      thresholdMps = SPEED_SEVERE_MPS;
    } else if (calcSpeedMps > SPEED_MAJOR_MPS) {
      severity = CheatSeverity.MAJOR;
      thresholdMps = SPEED_MAJOR_MPS;
    } else if (calcSpeedMps > SPEED_MINOR_MPS) {
      severity = CheatSeverity.MINOR;
      thresholdMps = SPEED_MINOR_MPS;
    }
    if (!severity) return null;

    return {
      detector: CheatDetector.SPEED_IMPOSSIBLE,
      severity,
      evidence: {
        detector: 'SPEED_IMPOSSIBLE',
        deltaM,
        dtSeconds,
        calcSpeedMps,
        thresholdMps,
        previousFixId: previous.id,
      },
    };
  }

  private evaluateJump(
    previous: PositionHistory,
    job: AntiCheatInspectJob,
    recordedAt: Date,
  ): DetectorHit | null {
    const dtSeconds = (recordedAt.getTime() - previous.recordedAt.getTime()) / 1000;
    if (dtSeconds < 0) return null;
    if (dtSeconds >= JUMP_DT_MAX_S) return null;

    const deltaM = haversineMeters(previous.lat, previous.lon, job.lat, job.lon);
    if (deltaM <= JUMP_DELTA_M) return null;

    return {
      detector: CheatDetector.LOCATION_JUMP,
      severity: CheatSeverity.MAJOR,
      evidence: {
        detector: 'LOCATION_JUMP',
        deltaM,
        dtSeconds,
        previousFixId: previous.id,
      },
    };
  }

  private evaluateGpsInconsistency(
    previousFixes: PositionHistory[],
    job: AntiCheatInspectJob,
    recordedAt: Date,
  ): DetectorHit | null {
    // (a) Three consecutive fixes (current + 2 previous) with accuracy worse
    // than the threshold suggests degraded hardware or spoofing patterns.
    if (job.accuracyM !== undefined && job.accuracyM > GPS_BAD_ACCURACY_M) {
      const window = previousFixes.slice(0, GPS_CONSECUTIVE_BAD - 1);
      const allBad =
        window.length === GPS_CONSECUTIVE_BAD - 1 &&
        window.every((p) => p.accuracyM !== null && p.accuracyM > GPS_BAD_ACCURACY_M);
      if (allBad) {
        return {
          detector: CheatDetector.GPS_INCONSISTENCY,
          severity: CheatSeverity.MINOR,
          evidence: {
            detector: 'GPS_INCONSISTENCY',
            reason: 'consecutive_bad_accuracy',
            accuracySamples: [...window.map((p) => p.accuracyM ?? null).reverse(), job.accuracyM],
          },
        };
      }
    }

    // (b) Client-reported instantaneous speed disagrees with the haversine-
    // derived one — a common signature of GPS mockers that fake `speedMps`
    // but interpolate coordinates poorly.
    const previous = previousFixes[0];
    if (previous && job.clientSpeedMps !== undefined) {
      const dtSeconds = (recordedAt.getTime() - previous.recordedAt.getTime()) / 1000;
      if (dtSeconds > 0) {
        const deltaM = haversineMeters(previous.lat, previous.lon, job.lat, job.lon);
        const calcSpeedMps = deltaM / dtSeconds;
        const divergenceMps = Math.abs(job.clientSpeedMps - calcSpeedMps);
        if (divergenceMps > GPS_SPEED_DIVERGENCE_MPS) {
          return {
            detector: CheatDetector.GPS_INCONSISTENCY,
            severity: CheatSeverity.MINOR,
            evidence: {
              detector: 'GPS_INCONSISTENCY',
              reason: 'speed_divergence',
              clientSpeedMps: job.clientSpeedMps,
              calcSpeedMps,
              divergenceMps,
              previousFixId: previous.id,
            },
          };
        }
      }
    }

    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance in meters between two WGS-84 points. */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

function mapToReputationSeverity(s: CheatSeverity): ReputationSeverity | null {
  if (s === CheatSeverity.MAJOR) return ReputationSeverity.MAJOR;
  if (s === CheatSeverity.SEVERE) return ReputationSeverity.SEVERE;
  return null;
}
