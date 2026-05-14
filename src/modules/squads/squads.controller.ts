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
  type SquadView,
  addMemberSchema,
  createSquadSchema,
  memberParamSchema,
  squadIdParamSchema,
  teamIdParamSchema,
  updateSquadSchema,
} from './dto/squads.dto';
import { SquadsService } from './squads.service';

function parse<T>(schema: ZodSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(result.error.flatten());
  }
  return result.data;
}

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class SquadsController {
  constructor(private readonly squads: SquadsService) {}

  // ─── Hierarchical (under /teams/:teamId) ────────────────────────────────

  @Post('teams/:teamId/squads')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async create(@Param() params: unknown, @Body() body: unknown): Promise<SquadView> {
    const { teamId } = parse(teamIdParamSchema, params);
    return this.squads.createForTeam(teamId, parse(createSquadSchema, body));
  }

  @Get('teams/:teamId/squads')
  async listByTeam(@Param() params: unknown): Promise<SquadView[]> {
    const { teamId } = parse(teamIdParamSchema, params);
    return this.squads.listByTeam(teamId);
  }

  // ─── ID-direct ──────────────────────────────────────────────────────────

  @Get('squads/:id')
  async getById(@Param() params: unknown): Promise<SquadView> {
    const { id } = parse(squadIdParamSchema, params);
    return this.squads.getById(id);
  }

  @Patch('squads/:id')
  @Roles(Role.ADMIN)
  async update(@Param() params: unknown, @Body() body: unknown): Promise<SquadView> {
    const { id } = parse(squadIdParamSchema, params);
    return this.squads.update(id, parse(updateSquadSchema, body));
  }

  @Delete('squads/:id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param() params: unknown): Promise<void> {
    const { id } = parse(squadIdParamSchema, params);
    await this.squads.remove(id);
  }

  // ─── Members ────────────────────────────────────────────────────────────

  @Post('squads/:id/members')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async addMember(@Param() params: unknown, @Body() body: unknown): Promise<SquadView> {
    const { id } = parse(squadIdParamSchema, params);
    return this.squads.addMember(id, parse(addMemberSchema, body));
  }

  @Delete('squads/:id/members/:operatorId')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(@Param() params: unknown): Promise<void> {
    const parsed = parse(memberParamSchema, params);
    await this.squads.removeMember(parsed.id, parsed.operatorId);
  }
}
