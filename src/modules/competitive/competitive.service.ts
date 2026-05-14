import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EventMode,
  EventStatus,
  type Round,
  RoundStatus,
  type RoundElimination,
} from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import {
  type CreateEliminationDto,
  type CreateRoundDto,
  type EliminationView,
  type MatchMvpRow,
  type MvpView,
  type OperatorScoreboardRow,
  type RoundMvpRow,
  type RoundView,
  type ScoreboardView,
  type TeamScoreboardRow,
  type UpdateRoundDto,
} from './dto/competitive.dto';

/**
 * Competitive 5×5 surface. One service holds rounds + eliminations + the
 * scoreboard/MVP read paths — they share enough invariants (operator must
 * roster on the event, round must be ACTIVE, etc.) that splitting them
 * would multiply guards without buying isolation we need yet.
 *
 * Scoreboard and MVP queries use parameterized $queryRaw because the
 * required joins traverse rounds → eliminations → operators → squads →
 * teams, and Prisma's groupBy doesn't cross relations cleanly.
 */
@Injectable()
export class CompetitiveService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Rounds ─────────────────────────────────────────────────────────────

  async createRound(eventId: string, dto: CreateRoundDto): Promise<RoundView> {
    await this.requireCompetitiveActiveEvent(eventId);

    const activeRound = await this.prisma.round.findFirst({
      where: { eventId, status: RoundStatus.ACTIVE },
    });
    if (activeRound) {
      throw new ConflictException(
        `Event already has an ACTIVE round (#${activeRound.roundNumber}); end it before starting a new one.`,
      );
    }

    const latest = await this.prisma.round.findFirst({
      where: { eventId },
      orderBy: { roundNumber: 'desc' },
    });
    const nextNumber = (latest?.roundNumber ?? 0) + 1;

    const round = await this.prisma.round.create({
      data: {
        eventId,
        roundNumber: nextNumber,
        note: dto.note ?? null,
      },
    });
    return this.toRoundView(round, 0, null);
  }

  async listRoundsByEvent(eventId: string): Promise<RoundView[]> {
    await this.requireEvent(eventId);
    const rows = await this.prisma.round.findMany({
      where: { eventId },
      orderBy: { roundNumber: 'asc' },
      include: {
        winningTeam: { select: { name: true } },
        _count: { select: { eliminations: true } },
      },
    });
    return rows.map((r) => this.toRoundView(r, r._count.eliminations, r.winningTeam?.name ?? null));
  }

  async getRound(id: string): Promise<RoundView> {
    const round = await this.prisma.round.findUnique({
      where: { id },
      include: {
        winningTeam: { select: { name: true } },
        _count: { select: { eliminations: true } },
      },
    });
    if (!round) throw new NotFoundException('Round not found.');
    return this.toRoundView(round, round._count.eliminations, round.winningTeam?.name ?? null);
  }

  async updateRound(id: string, dto: UpdateRoundDto): Promise<RoundView> {
    const existing = await this.prisma.round.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Round not found.');
    if (existing.status !== RoundStatus.ACTIVE) {
      throw new ConflictException(
        `Round is in status ${existing.status}; only ACTIVE rounds can be transitioned.`,
      );
    }

    let winningTeamId: string | null | undefined = dto.winningTeamId;

    if (dto.status === RoundStatus.COMPLETED) {
      // Tie path: winningTeamId may be null OR omitted.
      if (winningTeamId) {
        const team = await this.prisma.team.findUnique({ where: { id: winningTeamId } });
        if (!team || team.eventId !== existing.eventId) {
          throw new BadRequestException("winningTeamId does not belong to this round's event.");
        }
      }
    } else if (dto.status === RoundStatus.CANCELLED) {
      // Cancellation always clears the winner.
      winningTeamId = null;
    }

    const round = await this.prisma.round.update({
      where: { id },
      data: {
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.status !== undefined && { endedAt: new Date() }),
        ...(winningTeamId !== undefined && { winningTeamId }),
        ...(dto.note !== undefined && { note: dto.note }),
      },
      include: {
        winningTeam: { select: { name: true } },
        _count: { select: { eliminations: true } },
      },
    });
    return this.toRoundView(round, round._count.eliminations, round.winningTeam?.name ?? null);
  }

  // ─── Eliminations ───────────────────────────────────────────────────────

  async recordElimination(roundId: string, dto: CreateEliminationDto): Promise<EliminationView> {
    const round = await this.prisma.round.findUnique({ where: { id: roundId } });
    if (!round) throw new NotFoundException('Round not found.');
    if (round.status !== RoundStatus.ACTIVE) {
      throw new ConflictException(
        `Round is in status ${round.status}; only ACTIVE rounds can record eliminations.`,
      );
    }

    await this.requireOperatorRosteredInEvent(dto.eliminatedOperatorId, round.eventId, 'victim');
    if (dto.eliminatedById) {
      await this.requireOperatorRosteredInEvent(dto.eliminatedById, round.eventId, 'killer');
      if (dto.eliminatedById === dto.eliminatedOperatorId) {
        // Self-elim is fine ONLY when killer is null. With both set equal, the
        // input is inconsistent.
        throw new BadRequestException(
          'eliminatedById must differ from eliminatedOperatorId (use null for self-elim).',
        );
      }
    }

    try {
      const row = await this.prisma.roundElimination.create({
        data: {
          roundId,
          eliminatedOperatorId: dto.eliminatedOperatorId,
          eliminatedById: dto.eliminatedById ?? null,
          note: dto.note ?? null,
        },
        include: {
          eliminated: { select: { callsign: true } },
          killer: { select: { callsign: true } },
        },
      });
      return this.toEliminationView(row, row.eliminated.callsign, row.killer?.callsign ?? null);
    } catch (err) {
      throw this.translateUniqueViolation(
        err,
        'Operator was already eliminated in this round; record can only exist once per round.',
      );
    }
  }

  async listEliminationsByRound(roundId: string): Promise<EliminationView[]> {
    const round = await this.prisma.round.findUnique({ where: { id: roundId } });
    if (!round) throw new NotFoundException('Round not found.');
    const rows = await this.prisma.roundElimination.findMany({
      where: { roundId },
      orderBy: { eliminatedAt: 'asc' },
      include: {
        eliminated: { select: { callsign: true } },
        killer: { select: { callsign: true } },
      },
    });
    return rows.map((r) =>
      this.toEliminationView(r, r.eliminated.callsign, r.killer?.callsign ?? null),
    );
  }

  async deleteElimination(id: string): Promise<void> {
    const row = await this.prisma.roundElimination.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Elimination not found.');
    await this.prisma.roundElimination.delete({ where: { id } });
  }

  // ─── Scoreboard ─────────────────────────────────────────────────────────

  async getScoreboard(eventId: string): Promise<ScoreboardView> {
    await this.requireEvent(eventId);

    const [counts, teamRows, opRows] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{ rounds_played: bigint; rounds_completed: bigint; tied_rounds: bigint }>
      >`
        SELECT
          COUNT(*)::bigint                                                        AS rounds_played,
          COUNT(*) FILTER (WHERE status = 'COMPLETED')::bigint                    AS rounds_completed,
          COUNT(*) FILTER (WHERE status = 'COMPLETED' AND winning_team_id IS NULL)::bigint
                                                                                  AS tied_rounds
        FROM rounds
        WHERE event_id = ${eventId}::uuid
      `,
      this.prisma.$queryRaw<
        Array<{
          team_id: string;
          team_name: string;
          color: string;
          rounds_won: bigint;
          total_kills: bigint;
          total_deaths: bigint;
          operator_count: bigint;
        }>
      >`
        SELECT
          t.id    AS team_id,
          t.name  AS team_name,
          t.color AS color,
          (
            SELECT COUNT(*)::bigint FROM rounds r
            WHERE r.winning_team_id = t.id AND r.event_id = ${eventId}::uuid
          ) AS rounds_won,
          (
            SELECT COUNT(*)::bigint FROM round_eliminations re
            JOIN rounds r ON r.id = re.round_id
            JOIN squad_members sm ON sm.operator_id = re.eliminated_by_id
            JOIN squads s ON s.id = sm.squad_id
            WHERE r.event_id = ${eventId}::uuid AND s.team_id = t.id
          ) AS total_kills,
          (
            SELECT COUNT(*)::bigint FROM round_eliminations re
            JOIN rounds r ON r.id = re.round_id
            JOIN squad_members sm ON sm.operator_id = re.eliminated_operator_id
            JOIN squads s ON s.id = sm.squad_id
            WHERE r.event_id = ${eventId}::uuid AND s.team_id = t.id
          ) AS total_deaths,
          (
            SELECT COUNT(DISTINCT sm2.operator_id)::bigint FROM squads s2
            JOIN squad_members sm2 ON sm2.squad_id = s2.id
            WHERE s2.team_id = t.id
          ) AS operator_count
        FROM teams t
        WHERE t.event_id = ${eventId}::uuid
        ORDER BY rounds_won DESC, total_kills DESC, t.name ASC
      `,
      this.prisma.$queryRaw<
        Array<{
          operator_id: string;
          callsign: string;
          team_id: string | null;
          team_name: string | null;
          kills: bigint;
          deaths: bigint;
          rounds_played: bigint;
        }>
      >`
        SELECT
          o.id        AS operator_id,
          o.callsign  AS callsign,
          t.id        AS team_id,
          t.name      AS team_name,
          (
            SELECT COUNT(*)::bigint FROM round_eliminations re
            JOIN rounds r ON r.id = re.round_id
            WHERE re.eliminated_by_id = o.id AND r.event_id = ${eventId}::uuid
          ) AS kills,
          (
            SELECT COUNT(*)::bigint FROM round_eliminations re
            JOIN rounds r ON r.id = re.round_id
            WHERE re.eliminated_operator_id = o.id AND r.event_id = ${eventId}::uuid
          ) AS deaths,
          (SELECT COUNT(*)::bigint FROM rounds r WHERE r.event_id = ${eventId}::uuid) AS rounds_played
        FROM operators o
        JOIN squad_members sm ON sm.operator_id = o.id
        JOIN squads s         ON s.id = sm.squad_id
        JOIN teams t          ON t.id = s.team_id
        WHERE t.event_id = ${eventId}::uuid
        ORDER BY kills DESC, o.callsign ASC
      `,
    ]);

    const cnt = counts[0] ?? { rounds_played: 0n, rounds_completed: 0n, tied_rounds: 0n };

    const teams: TeamScoreboardRow[] = teamRows.map((r) => ({
      teamId: r.team_id,
      teamName: r.team_name,
      color: r.color,
      roundsWon: Number(r.rounds_won),
      totalKills: Number(r.total_kills),
      totalDeaths: Number(r.total_deaths),
      operatorCount: Number(r.operator_count),
    }));

    const operators: OperatorScoreboardRow[] = opRows.map((r) => {
      const kills = Number(r.kills);
      const deaths = Number(r.deaths);
      const roundsPlayed = Number(r.rounds_played);
      return {
        operatorId: r.operator_id,
        callsign: r.callsign,
        teamId: r.team_id,
        teamName: r.team_name,
        kills,
        deaths,
        kd: kdRatio(kills, deaths),
        roundsPlayed,
        roundsSurvived: Math.max(0, roundsPlayed - deaths),
      };
    });

    return {
      eventId,
      roundsPlayed: Number(cnt.rounds_played),
      roundsCompleted: Number(cnt.rounds_completed),
      tiedRounds: Number(cnt.tied_rounds),
      teams,
      operators,
    };
  }

  // ─── MVP ────────────────────────────────────────────────────────────────

  async getMvp(eventId: string): Promise<MvpView> {
    await this.requireEvent(eventId);

    const [roundRows, matchRows] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          round_id: string;
          round_number: number;
          operator_id: string;
          callsign: string;
          kills: bigint;
          survived: boolean;
        }>
      >`
        WITH per_round_kills AS (
          SELECT
            r.id                     AS round_id,
            r.round_number           AS round_number,
            re.eliminated_by_id      AS killer_id,
            COUNT(*)::bigint         AS kills,
            NOT EXISTS (
              SELECT 1 FROM round_eliminations re2
              WHERE re2.round_id = r.id AND re2.eliminated_operator_id = re.eliminated_by_id
            ) AS survived
          FROM rounds r
          JOIN round_eliminations re ON re.round_id = r.id
          WHERE r.event_id = ${eventId}::uuid AND re.eliminated_by_id IS NOT NULL
          GROUP BY r.id, r.round_number, re.eliminated_by_id
        ),
        ranked AS (
          SELECT
            prk.round_id,
            prk.round_number,
            prk.killer_id,
            prk.kills,
            prk.survived,
            o.callsign,
            ROW_NUMBER() OVER (
              PARTITION BY prk.round_id
              ORDER BY prk.kills DESC, prk.survived DESC, o.callsign ASC
            ) AS rank
          FROM per_round_kills prk
          JOIN operators o ON o.id = prk.killer_id
        )
        SELECT round_id, round_number, killer_id AS operator_id, callsign, kills, survived
        FROM ranked
        WHERE rank = 1
        ORDER BY round_number ASC
      `,
      this.prisma.$queryRaw<
        Array<{
          operator_id: string;
          callsign: string;
          team_id: string | null;
          team_name: string | null;
          total_kills: bigint;
          total_deaths: bigint;
        }>
      >`
        WITH operator_stats AS (
          SELECT
            o.id        AS operator_id,
            o.callsign  AS callsign,
            t.id        AS team_id,
            t.name      AS team_name,
            (
              SELECT COUNT(*)::bigint FROM round_eliminations re
              JOIN rounds r ON r.id = re.round_id
              WHERE re.eliminated_by_id = o.id AND r.event_id = ${eventId}::uuid
            ) AS total_kills,
            (
              SELECT COUNT(*)::bigint FROM round_eliminations re
              JOIN rounds r ON r.id = re.round_id
              WHERE re.eliminated_operator_id = o.id AND r.event_id = ${eventId}::uuid
            ) AS total_deaths
          FROM operators o
          JOIN squad_members sm ON sm.operator_id = o.id
          JOIN squads s         ON s.id = sm.squad_id
          JOIN teams t          ON t.id = s.team_id
          WHERE t.event_id = ${eventId}::uuid
        )
        SELECT operator_id, callsign, team_id, team_name, total_kills, total_deaths
        FROM operator_stats
        WHERE total_kills > 0
        ORDER BY total_kills DESC, (total_kills::float / NULLIF(total_deaths, 0)) DESC NULLS FIRST, callsign ASC
        LIMIT 1
      `,
    ]);

    const roundMvps: RoundMvpRow[] = roundRows.map((r) => ({
      roundId: r.round_id,
      roundNumber: r.round_number,
      operatorId: r.operator_id,
      callsign: r.callsign,
      kills: Number(r.kills),
      survived: r.survived,
    }));

    let matchMvp: MatchMvpRow | null = null;
    const top = matchRows[0];
    if (top) {
      const kills = Number(top.total_kills);
      const deaths = Number(top.total_deaths);
      matchMvp = {
        operatorId: top.operator_id,
        callsign: top.callsign,
        teamId: top.team_id,
        teamName: top.team_name,
        totalKills: kills,
        totalDeaths: deaths,
        kd: kdRatio(kills, deaths),
      };
    }

    return { eventId, matchMvp, roundMvps };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private async requireEvent(eventId: string): Promise<void> {
    const exists = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!exists) throw new NotFoundException('Event not found.');
  }

  private async requireCompetitiveActiveEvent(eventId: string): Promise<void> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found.');
    if (event.mode !== EventMode.COMPETITIVE) {
      throw new BadRequestException(
        `Event mode is ${event.mode}; rounds are only valid in COMPETITIVE events.`,
      );
    }
    if (event.status !== EventStatus.ACTIVE) {
      throw new ConflictException(
        `Event is in status ${event.status}; only ACTIVE events accept new rounds.`,
      );
    }
  }

  /**
   * The operator must be on the event's roster — i.e., a member of some squad
   * of one of the event's teams. Used for both victims and killers; the
   * `role` argument tunes the error message so the admin sees which side of
   * the elimination payload is wrong.
   */
  private async requireOperatorRosteredInEvent(
    operatorId: string,
    eventId: string,
    role: 'victim' | 'killer',
  ): Promise<void> {
    const rostered = await this.prisma.squadMember.findFirst({
      where: { operatorId, squad: { team: { eventId } } },
    });
    if (!rostered) {
      throw new BadRequestException(
        `${role === 'victim' ? 'Eliminated operator' : 'Killer'} is not on this event's roster.`,
      );
    }
  }

  private toRoundView(
    round: Round,
    eliminationCount: number,
    winningTeamName: string | null,
  ): RoundView {
    const durationSeconds =
      round.endedAt !== null
        ? Math.max(0, Math.round((round.endedAt.getTime() - round.startedAt.getTime()) / 1000))
        : null;
    return {
      id: round.id,
      eventId: round.eventId,
      roundNumber: round.roundNumber,
      status: round.status,
      startedAt: round.startedAt.toISOString(),
      endedAt: round.endedAt ? round.endedAt.toISOString() : null,
      durationSeconds,
      winningTeamId: round.winningTeamId,
      winningTeamName,
      eliminationCount,
      note: round.note,
      createdAt: round.createdAt.toISOString(),
      updatedAt: round.updatedAt.toISOString(),
    };
  }

  private toEliminationView(
    row: RoundElimination,
    eliminatedCallsign: string,
    killerCallsign: string | null,
  ): EliminationView {
    return {
      id: row.id,
      roundId: row.roundId,
      eliminatedOperatorId: row.eliminatedOperatorId,
      eliminatedCallsign,
      eliminatedById: row.eliminatedById,
      killerCallsign,
      eliminatedAt: row.eliminatedAt.toISOString(),
      note: row.note,
    };
  }

  private translateUniqueViolation(err: unknown, message: string): Error {
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code?: string }).code === 'P2002'
    ) {
      return new ConflictException(message);
    }
    return err as Error;
  }
}

/**
 * Kills / max(deaths, 1). When both are 0 → 0 (an operator who didn't engage
 * is not a 0-K/D ratio leader). Anything else uses the natural ratio.
 */
function kdRatio(kills: number, deaths: number): number {
  if (kills === 0 && deaths === 0) return 0;
  if (deaths === 0) return kills;
  return Number((kills / deaths).toFixed(4));
}
