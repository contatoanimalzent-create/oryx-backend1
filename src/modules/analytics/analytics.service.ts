import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../shared/database/prisma.service';
import { type OperatorAnalyticsRow, type SquadAnalyticsRow } from './dto/analytics.dto';

/**
 * Per-event performance metrics. Two views: per-operator (every operator that
 * either captured a position or progressed on a mission in this event) and
 * per-squad (rolling up the member metrics).
 *
 * Same posture as ranking (1.15): raw $queryRaw with CTEs, parameterized,
 * on-demand. Indexed paths exist (`position_history.operator_id+recorded_at`,
 * `mission_progress.mission_id`, `missions.event_id`). A materialized table
 * waits for observability to show real pressure (CLAUDE.md §3.6).
 *
 * Efficiency is computed in JS (completed / max(attempted, 1)) — keeps SQL
 * clean and the "0 / 0 = 0" guard explicit instead of a CASE buried in the
 * query.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOperatorsByEvent(eventId: string): Promise<OperatorAnalyticsRow[]> {
    await this.requireEvent(eventId);

    const rows = await this.prisma.$queryRaw<
      Array<{
        operator_id: string;
        callsign: string;
        missions_attempted: bigint;
        missions_completed: bigint;
        points_earned: bigint;
        total_mission_seconds: number;
        position_fixes: bigint;
        active_time_seconds: number;
        squad_id: string | null;
        squad_name: string | null;
        team_id: string | null;
        team_name: string | null;
      }>
    >`
      WITH
        event_operators AS (
          SELECT DISTINCT operator_id
          FROM position_history
          WHERE event_id = ${eventId}::uuid
          UNION
          SELECT DISTINCT mp.operator_id
          FROM mission_progress mp
          JOIN missions m ON m.id = mp.mission_id
          WHERE m.event_id = ${eventId}::uuid
        ),
        operator_missions AS (
          SELECT
            mp.operator_id,
            SUM(CASE WHEN mp.state <> 'NOT_STARTED' THEN 1 ELSE 0 END)::bigint AS attempted,
            SUM(CASE WHEN mp.state = 'COMPLETED' THEN 1 ELSE 0 END)::bigint    AS completed,
            SUM(CASE WHEN mp.state = 'COMPLETED' THEN m.points_reward ELSE 0 END)::bigint AS points,
            COALESCE(SUM(COALESCE((mp.progress->>'secondsAccumulated')::float, 0)), 0)::float
              AS mission_seconds
          FROM mission_progress mp
          JOIN missions m ON m.id = mp.mission_id
          WHERE m.event_id = ${eventId}::uuid
          GROUP BY mp.operator_id
        ),
        operator_positions AS (
          SELECT
            operator_id,
            COUNT(*)::bigint AS fixes,
            COALESCE(EXTRACT(EPOCH FROM (MAX(recorded_at) - MIN(recorded_at))), 0)::float
              AS active_seconds
          FROM position_history
          WHERE event_id = ${eventId}::uuid
          GROUP BY operator_id
        )
      SELECT
        o.id          AS operator_id,
        o.callsign    AS callsign,
        COALESCE(om.attempted, 0)::bigint        AS missions_attempted,
        COALESCE(om.completed, 0)::bigint        AS missions_completed,
        COALESCE(om.points, 0)::bigint           AS points_earned,
        COALESCE(om.mission_seconds, 0)::float   AS total_mission_seconds,
        COALESCE(op.fixes, 0)::bigint            AS position_fixes,
        COALESCE(op.active_seconds, 0)::float    AS active_time_seconds,
        s.id   AS squad_id,
        s.name AS squad_name,
        t.id   AS team_id,
        t.name AS team_name
      FROM event_operators eo
      JOIN operators o            ON o.id = eo.operator_id
      LEFT JOIN operator_missions  om ON om.operator_id = o.id
      LEFT JOIN operator_positions op ON op.operator_id = o.id
      LEFT JOIN squad_members sm   ON sm.operator_id = o.id
      LEFT JOIN squads s           ON s.id = sm.squad_id
      LEFT JOIN teams t            ON t.id = s.team_id AND t.event_id = ${eventId}::uuid
      WHERE (s.id IS NULL OR t.id IS NOT NULL)
      ORDER BY o.callsign ASC
    `;

    return rows.map((r) => {
      const attempted = Number(r.missions_attempted);
      const completed = Number(r.missions_completed);
      return {
        operatorId: r.operator_id,
        callsign: r.callsign,
        missionsAttempted: attempted,
        missionsCompleted: completed,
        efficiency: efficiencyOf(completed, attempted),
        pointsEarned: Number(r.points_earned),
        totalMissionSeconds: Number(r.total_mission_seconds),
        activeTimeSeconds: Number(r.active_time_seconds),
        positionFixes: Number(r.position_fixes),
        squadId: r.squad_id,
        squadName: r.squad_name,
        teamId: r.team_id,
        teamName: r.team_name,
      };
    });
  }

  async getSquadsByEvent(eventId: string): Promise<SquadAnalyticsRow[]> {
    await this.requireEvent(eventId);

    const rows = await this.prisma.$queryRaw<
      Array<{
        squad_id: string;
        squad_name: string;
        team_id: string;
        team_name: string;
        member_count: bigint;
        missions_attempted: bigint;
        missions_completed: bigint;
        points_earned: bigint;
        total_mission_seconds: number;
        position_fixes: bigint;
      }>
    >`
      WITH
        operator_missions AS (
          SELECT
            mp.operator_id,
            SUM(CASE WHEN mp.state <> 'NOT_STARTED' THEN 1 ELSE 0 END)::bigint AS attempted,
            SUM(CASE WHEN mp.state = 'COMPLETED' THEN 1 ELSE 0 END)::bigint    AS completed,
            SUM(CASE WHEN mp.state = 'COMPLETED' THEN m.points_reward ELSE 0 END)::bigint AS points,
            COALESCE(SUM(COALESCE((mp.progress->>'secondsAccumulated')::float, 0)), 0)::float
              AS mission_seconds
          FROM mission_progress mp
          JOIN missions m ON m.id = mp.mission_id
          WHERE m.event_id = ${eventId}::uuid
          GROUP BY mp.operator_id
        ),
        operator_positions AS (
          SELECT operator_id, COUNT(*)::bigint AS fixes
          FROM position_history
          WHERE event_id = ${eventId}::uuid
          GROUP BY operator_id
        )
      SELECT
        s.id    AS squad_id,
        s.name  AS squad_name,
        t.id    AS team_id,
        t.name  AS team_name,
        (SELECT COUNT(*) FROM squad_members sm2 WHERE sm2.squad_id = s.id)::bigint
          AS member_count,
        COALESCE(SUM(om.attempted), 0)::bigint        AS missions_attempted,
        COALESCE(SUM(om.completed), 0)::bigint        AS missions_completed,
        COALESCE(SUM(om.points), 0)::bigint           AS points_earned,
        COALESCE(SUM(om.mission_seconds), 0)::float   AS total_mission_seconds,
        COALESCE(SUM(op.fixes), 0)::bigint            AS position_fixes
      FROM squads s
      JOIN teams t                  ON t.id = s.team_id AND t.event_id = ${eventId}::uuid
      LEFT JOIN squad_members sm    ON sm.squad_id = s.id
      LEFT JOIN operator_missions  om ON om.operator_id = sm.operator_id
      LEFT JOIN operator_positions op ON op.operator_id = sm.operator_id
      GROUP BY s.id, s.name, t.id, t.name
      ORDER BY s.name ASC
    `;

    return rows.map((r) => {
      const attempted = Number(r.missions_attempted);
      const completed = Number(r.missions_completed);
      return {
        squadId: r.squad_id,
        squadName: r.squad_name,
        teamId: r.team_id,
        teamName: r.team_name,
        memberCount: Number(r.member_count),
        missionsAttempted: attempted,
        missionsCompleted: completed,
        efficiency: efficiencyOf(completed, attempted),
        pointsEarned: Number(r.points_earned),
        totalMissionSeconds: Number(r.total_mission_seconds),
        positionFixes: Number(r.position_fixes),
      };
    });
  }

  private async requireEvent(eventId: string): Promise<void> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Event not found.');
    }
  }
}

/**
 * Engagement-aware efficiency: 0 when nothing was attempted (avoids NaN and
 * keeps the surface honest — "no missions started" is distinct from "100%
 * efficient"). Clamped to [0, 1] just in case of bad input.
 */
function efficiencyOf(completed: number, attempted: number): number {
  if (attempted <= 0) return 0;
  const raw = completed / attempted;
  if (raw < 0) return 0;
  if (raw > 1) return 1;
  return raw;
}
