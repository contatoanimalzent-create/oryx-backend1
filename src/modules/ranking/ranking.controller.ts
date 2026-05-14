import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import type { ZodSchema } from 'zod';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  type OperatorRankingRow,
  RANKING_LIMIT_DEFAULT,
  type RankingQuery,
  type SquadRankingRow,
  type TeamRankingRow,
  eventIdParamSchema,
  rankingQuerySchema,
} from './dto/ranking.dto';
import { RankingService } from './ranking.service';

function parse<T>(schema: ZodSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(result.error.flatten());
  }
  return result.data;
}

function parseQuery(value: unknown): RankingQuery {
  const { limit } = parse(rankingQuerySchema, value ?? {});
  return { limit: limit ?? RANKING_LIMIT_DEFAULT };
}

/**
 * Read-only ranking endpoints scoped to one event. Auth required (JWT) but no
 * RBAC restriction: ranking is gameplay surface — operators see it on the
 * mobile app, admins see it on the dashboard. Same payload for both.
 */
@Controller('events/:eventId/ranking')
@UseGuards(JwtAuthGuard)
export class RankingController {
  constructor(private readonly ranking: RankingService) {}

  @Get('operators')
  async operators(
    @Param() params: unknown,
    @Query() query: unknown,
  ): Promise<OperatorRankingRow[]> {
    const { eventId } = parse(eventIdParamSchema, params);
    return this.ranking.getOperatorsByEvent(eventId, parseQuery(query));
  }

  @Get('squads')
  async squads(@Param() params: unknown, @Query() query: unknown): Promise<SquadRankingRow[]> {
    const { eventId } = parse(eventIdParamSchema, params);
    return this.ranking.getSquadsByEvent(eventId, parseQuery(query));
  }

  @Get('teams')
  async teams(@Param() params: unknown, @Query() query: unknown): Promise<TeamRankingRow[]> {
    const { eventId } = parse(eventIdParamSchema, params);
    return this.ranking.getTeamsByEvent(eventId, parseQuery(query));
  }
}
