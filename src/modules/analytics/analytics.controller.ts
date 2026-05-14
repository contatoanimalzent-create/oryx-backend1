import { BadRequestException, Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { ZodSchema } from 'zod';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  type OperatorAnalyticsRow,
  type SquadAnalyticsRow,
  eventIdParamSchema,
} from './dto/analytics.dto';
import { AnalyticsService } from './analytics.service';

function parse<T>(schema: ZodSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(result.error.flatten());
  }
  return result.data;
}

/**
 * Per-event analytics. ADMIN/INSTRUCTOR only — ranking is the public surface
 * (any authenticated user); analytics is for command dashboards and AAR, so
 * exposing it to operators would leak cross-faction operational patterns.
 */
@Controller('events/:eventId/analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.INSTRUCTOR)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('operators')
  async operators(@Param() params: unknown): Promise<OperatorAnalyticsRow[]> {
    const { eventId } = parse(eventIdParamSchema, params);
    return this.analytics.getOperatorsByEvent(eventId);
  }

  @Get('squads')
  async squads(@Param() params: unknown): Promise<SquadAnalyticsRow[]> {
    const { eventId } = parse(eventIdParamSchema, params);
    return this.analytics.getSquadsByEvent(eventId);
  }
}
