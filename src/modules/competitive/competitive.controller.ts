import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { ZodSchema } from 'zod';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  createEliminationSchema,
  createRoundSchema,
  type EliminationView,
  eliminationIdParamSchema,
  eventIdParamSchema,
  type MvpView,
  type RoundView,
  roundIdParamSchema,
  type ScoreboardView,
  updateRoundSchema,
} from './dto/competitive.dto';
import { CompetitiveService } from './competitive.service';

function parse<T>(schema: ZodSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(result.error.flatten());
  }
  return result.data;
}

/**
 * Reads (rounds/scoreboard/mvp) are gameplay surface — any authenticated
 * user. Writes (round start/end + elimination CRUD) are ADMIN+INSTRUCTOR.
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompetitiveController {
  constructor(private readonly competitive: CompetitiveService) {}

  // ─── Rounds (event-scoped) ──────────────────────────────────────────────

  @Post('events/:eventId/competitive/rounds')
  @Roles(Role.ADMIN, Role.INSTRUCTOR)
  @HttpCode(HttpStatus.CREATED)
  async startRound(@Param() params: unknown, @Body() body: unknown): Promise<RoundView> {
    const { eventId } = parse(eventIdParamSchema, params);
    return this.competitive.createRound(eventId, parse(createRoundSchema, body));
  }

  @Get('events/:eventId/competitive/rounds')
  async listRounds(@Param() params: unknown): Promise<RoundView[]> {
    const { eventId } = parse(eventIdParamSchema, params);
    return this.competitive.listRoundsByEvent(eventId);
  }

  // ─── Rounds (id-direct) ─────────────────────────────────────────────────

  @Get('competitive/rounds/:id')
  async getRound(@Param() params: unknown): Promise<RoundView> {
    const { id } = parse(roundIdParamSchema, params);
    return this.competitive.getRound(id);
  }

  @Patch('competitive/rounds/:id')
  @Roles(Role.ADMIN, Role.INSTRUCTOR)
  async patchRound(@Param() params: unknown, @Body() body: unknown): Promise<RoundView> {
    const { id } = parse(roundIdParamSchema, params);
    return this.competitive.updateRound(id, parse(updateRoundSchema, body));
  }

  // ─── Eliminations ───────────────────────────────────────────────────────

  @Post('competitive/rounds/:id/eliminations')
  @Roles(Role.ADMIN, Role.INSTRUCTOR)
  @HttpCode(HttpStatus.CREATED)
  async recordElimination(
    @Param() params: unknown,
    @Body() body: unknown,
  ): Promise<EliminationView> {
    const { id } = parse(roundIdParamSchema, params);
    return this.competitive.recordElimination(id, parse(createEliminationSchema, body));
  }

  @Get('competitive/rounds/:id/eliminations')
  async listEliminations(@Param() params: unknown): Promise<EliminationView[]> {
    const { id } = parse(roundIdParamSchema, params);
    return this.competitive.listEliminationsByRound(id);
  }

  @Delete('competitive/eliminations/:id')
  @Roles(Role.ADMIN, Role.INSTRUCTOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteElimination(@Param() params: unknown): Promise<void> {
    const { id } = parse(eliminationIdParamSchema, params);
    await this.competitive.deleteElimination(id);
  }

  // ─── Scoreboard + MVP ───────────────────────────────────────────────────

  @Get('events/:eventId/competitive/scoreboard')
  async scoreboard(@Param() params: unknown): Promise<ScoreboardView> {
    const { eventId } = parse(eventIdParamSchema, params);
    return this.competitive.getScoreboard(eventId);
  }

  @Get('events/:eventId/competitive/mvp')
  async mvp(@Param() params: unknown): Promise<MvpView> {
    const { eventId } = parse(eventIdParamSchema, params);
    return this.competitive.getMvp(eventId);
  }
}
