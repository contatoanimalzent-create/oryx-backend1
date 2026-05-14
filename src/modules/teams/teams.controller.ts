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
  type TeamView,
  createTeamSchema,
  eventIdParamSchema,
  teamIdParamSchema,
  updateTeamSchema,
} from './dto/teams.dto';
import { TeamsService } from './teams.service';

function parse<T>(schema: ZodSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(result.error.flatten());
  }
  return result.data;
}

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  // ─── Hierarchical (under /events/:eventId) ───────────────────────────────

  @Post('events/:eventId/teams')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async create(@Param() params: unknown, @Body() body: unknown): Promise<TeamView> {
    const { eventId } = parse(eventIdParamSchema, params);
    return this.teams.createForEvent(eventId, parse(createTeamSchema, body));
  }

  @Get('events/:eventId/teams')
  async listByEvent(@Param() params: unknown): Promise<TeamView[]> {
    const { eventId } = parse(eventIdParamSchema, params);
    return this.teams.listByEvent(eventId);
  }

  // ─── ID-direct ───────────────────────────────────────────────────────────

  @Get('teams/:id')
  async getById(@Param() params: unknown): Promise<TeamView> {
    const { id } = parse(teamIdParamSchema, params);
    return this.teams.getById(id);
  }

  @Patch('teams/:id')
  @Roles(Role.ADMIN)
  async update(@Param() params: unknown, @Body() body: unknown): Promise<TeamView> {
    const { id } = parse(teamIdParamSchema, params);
    return this.teams.update(id, parse(updateTeamSchema, body));
  }

  @Delete('teams/:id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param() params: unknown): Promise<void> {
    const { id } = parse(teamIdParamSchema, params);
    await this.teams.remove(id);
  }
}
