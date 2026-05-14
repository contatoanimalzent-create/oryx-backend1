import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';
import {
  type ExportQuery,
  type ExportView,
  type PositionsPage,
  type PositionsQuery,
  type TimelineEntry,
  type TimelineQuery,
} from './dto/aar.dto';

/**
 * After-Action Review queries. Three views:
 *   - timeline : normalized chronological feed of mission completions, cheat
 *                suspicions and reputation entries — three sources UNION'd
 *                with a discriminator column, ordered by `at`.
 *   - positions : keyset-paginated cursor on `recordedAt` (the existing index
 *                `(operator_id, recorded_at DESC)` makes this cheap even on
 *                a position_history table with millions of rows).
 *   - export   : single JSON document consolidating event + participants
 *                (delegated to AnalyticsService) + missions + zones + a
 *                bounded timeline + the bare positions count. CSV streaming
 *                lands in the dedicated tactical-report session (1.22).
 *
 * No state, no side-effects — admin/instructor view, ADMIN/INSTRUCTOR-gated at
 * the controller layer.
 */
@Injectable()
export class AarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
  ) {}

  async getTimeline(eventId: string, query: TimelineQuery): Promise<TimelineEntry[]> {
    await this.requireEvent(eventId);

    const fromClause = query.fromAt
      ? Prisma.sql`AND at >= ${query.fromAt}::timestamptz`
      : Prisma.empty;
    const toClause = query.toAt ? Prisma.sql`AND at <= ${query.toAt}::timestamptz` : Prisma.empty;

    const rows = await this.prisma.$queryRaw<
      Array<{
        kind: 'MISSION_COMPLETED' | 'CHEAT_SUSPICION' | 'REPUTATION_ENTRY';
        at: Date;
        operator_id: string;
        operator_callsign: string;
        // mission completion
        mission_id: string | null;
        mission_name: string | null;
        mission_type: string | null;
        points_reward: number | null;
        // cheat suspicion
        suspicion_id: string | null;
        detector: string | null;
        cheat_severity: string | null;
        // reputation
        rep_log_id: string | null;
        rep_kind: string | null;
        rep_severity: string | null;
        rep_reason: string | null;
        rep_delta: number | null;
        rep_created_by_id: string | null;
      }>
    >`
      SELECT * FROM (
        SELECT
          'MISSION_COMPLETED'::text       AS kind,
          mp.completed_at                 AS at,
          mp.operator_id                  AS operator_id,
          o.callsign                      AS operator_callsign,
          m.id                            AS mission_id,
          m.name                          AS mission_name,
          m.type::text                    AS mission_type,
          m.points_reward                 AS points_reward,
          NULL::uuid                      AS suspicion_id,
          NULL::text                      AS detector,
          NULL::text                      AS cheat_severity,
          NULL::uuid                      AS rep_log_id,
          NULL::text                      AS rep_kind,
          NULL::text                      AS rep_severity,
          NULL::text                      AS rep_reason,
          NULL::integer                   AS rep_delta,
          NULL::uuid                      AS rep_created_by_id
        FROM mission_progress mp
        JOIN missions m  ON m.id = mp.mission_id
        JOIN operators o ON o.id = mp.operator_id
        WHERE m.event_id = ${eventId}::uuid
          AND mp.completed_at IS NOT NULL

        UNION ALL

        SELECT
          'CHEAT_SUSPICION'::text         AS kind,
          cs.recorded_at                  AS at,
          cs.operator_id                  AS operator_id,
          o.callsign                      AS operator_callsign,
          NULL::uuid                      AS mission_id,
          NULL::text                      AS mission_name,
          NULL::text                      AS mission_type,
          NULL::integer                   AS points_reward,
          cs.id                           AS suspicion_id,
          cs.detector::text               AS detector,
          cs.severity::text               AS cheat_severity,
          NULL::uuid                      AS rep_log_id,
          NULL::text                      AS rep_kind,
          NULL::text                      AS rep_severity,
          NULL::text                      AS rep_reason,
          NULL::integer                   AS rep_delta,
          NULL::uuid                      AS rep_created_by_id
        FROM cheat_suspicions cs
        JOIN operators o ON o.id = cs.operator_id
        WHERE cs.event_id = ${eventId}::uuid

        UNION ALL

        SELECT
          'REPUTATION_ENTRY'::text        AS kind,
          rl.created_at                   AS at,
          rl.operator_id                  AS operator_id,
          o.callsign                      AS operator_callsign,
          NULL::uuid                      AS mission_id,
          NULL::text                      AS mission_name,
          NULL::text                      AS mission_type,
          NULL::integer                   AS points_reward,
          NULL::uuid                      AS suspicion_id,
          NULL::text                      AS detector,
          NULL::text                      AS cheat_severity,
          rl.id                           AS rep_log_id,
          rl.kind::text                   AS rep_kind,
          rl.severity::text               AS rep_severity,
          rl.reason::text                 AS rep_reason,
          rl.delta                        AS rep_delta,
          rl.created_by_id                AS rep_created_by_id
        FROM reputation_logs rl
        JOIN operators o ON o.id = rl.operator_id
        WHERE rl.event_id = ${eventId}::uuid
      ) AS u
      WHERE TRUE ${fromClause} ${toClause}
      ORDER BY at ASC
      LIMIT ${query.limit}
    `;

    return rows.map((r) => this.mapTimelineRow(r));
  }

  async getPositions(eventId: string, query: PositionsQuery): Promise<PositionsPage> {
    await this.requireEvent(eventId);

    const operatorClause = query.operatorId
      ? Prisma.sql`AND ph.operator_id = ${query.operatorId}::uuid`
      : Prisma.empty;
    const fromClause = query.fromAt
      ? Prisma.sql`AND ph.recorded_at >= ${query.fromAt}::timestamptz`
      : Prisma.empty;
    const toClause = query.toAt
      ? Prisma.sql`AND ph.recorded_at <= ${query.toAt}::timestamptz`
      : Prisma.empty;
    // Cursor is the last row's recordedAt; we use STRICTLY GREATER THAN so we
    // don't re-emit it. With sub-millisecond resolution from PG timestamptz
    // (6 digits) collisions are negligible — if they happen, the only
    // consequence is a single dropped row, never duplicates.
    const cursorClause = query.cursor
      ? Prisma.sql`AND ph.recorded_at > ${query.cursor}::timestamptz`
      : Prisma.empty;

    // limit + 1: we fetch one extra row so we can tell whether a next page
    // exists without an additional COUNT roundtrip.
    const fetchLimit = query.limit + 1;

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        operator_id: string;
        operator_callsign: string;
        lat: number;
        lon: number;
        accuracy_m: number | null;
        heading_deg: number | null;
        speed_mps: number | null;
        recorded_at: Date;
      }>
    >`
      SELECT
        ph.id            AS id,
        ph.operator_id   AS operator_id,
        o.callsign       AS operator_callsign,
        ph.lat           AS lat,
        ph.lon           AS lon,
        ph.accuracy_m    AS accuracy_m,
        ph.heading_deg   AS heading_deg,
        ph.speed_mps     AS speed_mps,
        ph.recorded_at   AS recorded_at
      FROM position_history ph
      JOIN operators o ON o.id = ph.operator_id
      WHERE ph.event_id = ${eventId}::uuid
      ${operatorClause}
      ${fromClause}
      ${toClause}
      ${cursorClause}
      ORDER BY ph.recorded_at ASC
      LIMIT ${fetchLimit}
    `;

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor = hasMore ? page[page.length - 1].recorded_at.toISOString() : null;

    return {
      rows: page.map((r) => ({
        id: r.id,
        operatorId: r.operator_id,
        operatorCallsign: r.operator_callsign,
        lat: r.lat,
        lon: r.lon,
        accuracyM: r.accuracy_m,
        headingDeg: r.heading_deg,
        speedMps: r.speed_mps,
        recordedAt: r.recorded_at.toISOString(),
      })),
      nextCursor,
    };
  }

  async exportEvent(eventId: string, query: ExportQuery): Promise<ExportView> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Event not found.');
    }

    const [analyticsRows, missions, zones, positionsCount] = await Promise.all([
      this.analytics.getOperatorsByEvent(eventId),
      this.prisma.mission.findMany({
        where: { eventId },
        include: { progress: { where: { state: 'COMPLETED' } } },
      }),
      this.prisma.zone.findMany({ where: { eventId }, select: { id: true, name: true } }),
      this.prisma.positionHistory.count({ where: { eventId } }),
    ]);

    const timeline = query.includeTimeline
      ? await this.getTimeline(eventId, { fromAt: null, toAt: null, limit: 1_000 })
      : [];

    return {
      event: {
        id: event.id,
        name: event.name,
        mode: event.mode,
        status: event.status,
        startsAt: event.startsAt ? event.startsAt.toISOString() : null,
        endsAt: event.endsAt ? event.endsAt.toISOString() : null,
      },
      participants: analyticsRows.map((r) => ({
        operatorId: r.operatorId,
        callsign: r.callsign,
        missionsAttempted: r.missionsAttempted,
        missionsCompleted: r.missionsCompleted,
        pointsEarned: r.pointsEarned,
        positionFixes: r.positionFixes,
        squadName: r.squadName,
        teamName: r.teamName,
      })),
      missions: missions.map((m) => ({
        id: m.id,
        name: m.name,
        type: m.type,
        status: m.status,
        pointsReward: m.pointsReward,
        completions: m.progress.length,
      })),
      zones,
      timeline,
      positionsCount,
      generatedAt: new Date().toISOString(),
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private async requireEvent(eventId: string): Promise<void> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Event not found.');
    }
  }

  private mapTimelineRow(r: {
    kind: 'MISSION_COMPLETED' | 'CHEAT_SUSPICION' | 'REPUTATION_ENTRY';
    at: Date;
    operator_id: string;
    operator_callsign: string;
    mission_id: string | null;
    mission_name: string | null;
    mission_type: string | null;
    points_reward: number | null;
    suspicion_id: string | null;
    detector: string | null;
    cheat_severity: string | null;
    rep_log_id: string | null;
    rep_kind: string | null;
    rep_severity: string | null;
    rep_reason: string | null;
    rep_delta: number | null;
    rep_created_by_id: string | null;
  }): TimelineEntry {
    const base = {
      at: r.at.toISOString(),
      operatorId: r.operator_id,
      operatorCallsign: r.operator_callsign,
    };

    switch (r.kind) {
      case 'MISSION_COMPLETED':
        return {
          ...base,
          kind: 'MISSION_COMPLETED',
          payload: {
            missionId: r.mission_id ?? '',
            missionName: r.mission_name ?? '',
            missionType: r.mission_type ?? '',
            pointsReward: r.points_reward ?? 0,
          },
        };
      case 'CHEAT_SUSPICION':
        return {
          ...base,
          kind: 'CHEAT_SUSPICION',
          payload: {
            suspicionId: r.suspicion_id ?? '',
            detector: r.detector ?? '',
            severity: r.cheat_severity ?? '',
          },
        };
      case 'REPUTATION_ENTRY':
        return {
          ...base,
          kind: 'REPUTATION_ENTRY',
          payload: {
            logId: r.rep_log_id ?? '',
            kind: r.rep_kind ?? '',
            severity: r.rep_severity ?? '',
            reason: r.rep_reason ?? '',
            delta: r.rep_delta ?? 0,
            systemGenerated: r.rep_created_by_id === null,
          },
        };
    }
  }
}
