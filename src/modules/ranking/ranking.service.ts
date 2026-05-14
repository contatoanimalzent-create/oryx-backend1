import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../shared/database/prisma.service';
import {
  type OperatorRankingRow,
  type RankingQuery,
  type SquadRankingRow,
  type TeamRankingRow,
} from './dto/ranking.dto';

/**
 * Read-only aggregations over mission_progress (state=COMPLETED) joined with
 * missions.points_reward, scoped to a single event. Three views: per-operator,
 * per-squad, per-team (faction).
 *
 * Uses parameterized $queryRaw because Prisma's groupBy doesn't cross
 * relations, and we need joins through squad_members → squads → teams. SQL is
 * authored once, indexed paths exist (mission_progress.operator_id, missions
 * .event_id, squad_members.operator_id), and rows aren't large enough to warrant
 * a materialized table yet (CLAUDE.md §3.6).
 *
 * "One squad per event per operator" is enforced at write-time by squads
 * service (1.6). Aggregations here trust that invariant — if it ever broke,
 * an operator would appear in multiple squad rows but never inflate their own
 * point total (the operator-level query goes straight through mission_progress).
 */
@Injectable()
export class RankingService {
  constructor(private readonly prisma: PrismaService) {}

  async getOperatorsByEvent(eventId: string, query: RankingQuery): Promise<OperatorRankingRow[]> {
    await this.requireEvent(eventId);

    // LEFT JOIN through squad_members → squads → teams scoped to THIS event,
    // so an operator who is in a squad of a different event still appears
    // with null squad/team here. The mp.operator_id → operators FK guarantees
    // operator existence.
    const rows = await this.prisma.$queryRaw<
      Array<{
        operator_id: string;
        callsign: string;
        points: bigint;
        missions_completed: bigint;
        squad_id: string | null;
        squad_name: string | null;
        team_id: string | null;
        team_name: string | null;
      }>
    >`
      SELECT
        o.id            AS operator_id,
        o.callsign      AS callsign,
        SUM(m.points_reward)::bigint AS points,
        COUNT(*)::bigint AS missions_completed,
        s.id            AS squad_id,
        s.name          AS squad_name,
        t.id            AS team_id,
        t.name          AS team_name
      FROM mission_progress mp
      JOIN missions m   ON m.id = mp.mission_id
      JOIN operators o  ON o.id = mp.operator_id
      LEFT JOIN squad_members sm ON sm.operator_id = o.id
      LEFT JOIN squads s         ON s.id = sm.squad_id
      LEFT JOIN teams  t         ON t.id = s.team_id AND t.event_id = ${eventId}::uuid
      WHERE mp.state = 'COMPLETED'
        AND m.event_id = ${eventId}::uuid
        AND (s.id IS NULL OR t.id IS NOT NULL)
      GROUP BY o.id, o.callsign, s.id, s.name, t.id, t.name
      ORDER BY points DESC, missions_completed DESC, o.callsign ASC
      LIMIT ${query.limit}
    `;

    return rows.map((r) => ({
      operatorId: r.operator_id,
      callsign: r.callsign,
      points: Number(r.points),
      missionsCompleted: Number(r.missions_completed),
      squadId: r.squad_id,
      squadName: r.squad_name,
      teamId: r.team_id,
      teamName: r.team_name,
    }));
  }

  async getSquadsByEvent(eventId: string, query: RankingQuery): Promise<SquadRankingRow[]> {
    await this.requireEvent(eventId);

    const rows = await this.prisma.$queryRaw<
      Array<{
        squad_id: string;
        squad_name: string;
        team_id: string;
        team_name: string;
        points: bigint | null;
        missions_completed: bigint | null;
        member_count: bigint;
      }>
    >`
      SELECT
        s.id   AS squad_id,
        s.name AS squad_name,
        t.id   AS team_id,
        t.name AS team_name,
        COALESCE(SUM(m.points_reward), 0)::bigint AS points,
        COALESCE(COUNT(mp.id), 0)::bigint         AS missions_completed,
        (SELECT COUNT(*) FROM squad_members sm2 WHERE sm2.squad_id = s.id)::bigint AS member_count
      FROM squads s
      JOIN teams t ON t.id = s.team_id AND t.event_id = ${eventId}::uuid
      LEFT JOIN squad_members sm ON sm.squad_id = s.id
      LEFT JOIN mission_progress mp
        ON mp.operator_id = sm.operator_id AND mp.state = 'COMPLETED'
      LEFT JOIN missions m
        ON m.id = mp.mission_id AND m.event_id = ${eventId}::uuid
      GROUP BY s.id, s.name, t.id, t.name
      ORDER BY points DESC, missions_completed DESC, s.name ASC
      LIMIT ${query.limit}
    `;

    return rows.map((r) => ({
      squadId: r.squad_id,
      squadName: r.squad_name,
      teamId: r.team_id,
      teamName: r.team_name,
      points: Number(r.points ?? 0),
      missionsCompleted: Number(r.missions_completed ?? 0),
      memberCount: Number(r.member_count),
    }));
  }

  async getTeamsByEvent(eventId: string, query: RankingQuery): Promise<TeamRankingRow[]> {
    await this.requireEvent(eventId);

    // operator_count uses DISTINCT — an operator is one count even if they
    // appear in multiple squads of the same team (shouldn't happen, but the
    // schema doesn't preclude it).
    const rows = await this.prisma.$queryRaw<
      Array<{
        team_id: string;
        team_name: string;
        color: string;
        points: bigint | null;
        missions_completed: bigint | null;
        operator_count: bigint;
      }>
    >`
      SELECT
        t.id    AS team_id,
        t.name  AS team_name,
        t.color AS color,
        COALESCE(SUM(m.points_reward), 0)::bigint AS points,
        COALESCE(COUNT(mp.id), 0)::bigint         AS missions_completed,
        (
          SELECT COUNT(DISTINCT sm2.operator_id)
          FROM squads s2
          JOIN squad_members sm2 ON sm2.squad_id = s2.id
          WHERE s2.team_id = t.id
        )::bigint AS operator_count
      FROM teams t
      LEFT JOIN squads s         ON s.team_id = t.id
      LEFT JOIN squad_members sm ON sm.squad_id = s.id
      LEFT JOIN mission_progress mp
        ON mp.operator_id = sm.operator_id AND mp.state = 'COMPLETED'
      LEFT JOIN missions m
        ON m.id = mp.mission_id AND m.event_id = ${eventId}::uuid
      WHERE t.event_id = ${eventId}::uuid
      GROUP BY t.id, t.name, t.color
      ORDER BY points DESC, missions_completed DESC, t.name ASC
      LIMIT ${query.limit}
    `;

    return rows.map((r) => ({
      teamId: r.team_id,
      teamName: r.team_name,
      color: r.color,
      points: Number(r.points ?? 0),
      missionsCompleted: Number(r.missions_completed ?? 0),
      operatorCount: Number(r.operator_count),
    }));
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async requireEvent(eventId: string): Promise<void> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Event not found.');
    }
  }
}
