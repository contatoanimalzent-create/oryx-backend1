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
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { ZodSchema } from 'zod';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  type MissionView,
  createMissionSchema,
  eventIdParamSchema,
  missionIdParamSchema,
  missionListQuerySchema,
  updateMissionSchema,
} from './dto/missions.dto';
import { MissionsService } from './missions.service';

function parse<T>(schema: ZodSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(result.error.flatten());
  }
  return result.data;
}

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class MissionsController {
  constructor(private readonly missions: MissionsService) {}

  @Post('events/:eventId/missions')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async create(@Param() params: unknown, @Body() body: unknown): Promise<MissionView> {
    const { eventId } = parse(eventIdParamSchema, params);
    return this.missions.createForEvent(eventId, parse(createMissionSchema, body));
  }

  @Get('events/:eventId/missions')
  async listByEvent(@Param() params: unknown, @Query() query: unknown): Promise<MissionView[]> {
    const { eventId } = parse(eventIdParamSchema, params);
    return this.missions.listByEvent(eventId, parse(missionListQuerySchema, query ?? {}));
  }

  @Get('missions/:id')
  async getById(@Param() params: unknown): Promise<MissionView> {
    const { id } = parse(missionIdParamSchema, params);
    return this.missions.getById(id);
  }

  @Patch('missions/:id')
  @Roles(Role.ADMIN)
  async update(@Param() params: unknown, @Body() body: unknown): Promise<MissionView> {
    const { id } = parse(missionIdParamSchema, params);
    return this.missions.update(id, parse(updateMissionSchema, body));
  }

  @Delete('missions/:id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param() params: unknown): Promise<void> {
    const { id } = parse(missionIdParamSchema, params);
    await this.missions.remove(id);
  }
}
