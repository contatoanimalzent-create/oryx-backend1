import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { ZodSchema } from 'zod';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  type ExportQuery,
  type ExportView,
  POSITIONS_LIMIT_DEFAULT,
  type PositionsPage,
  type PositionsQuery,
  TIMELINE_LIMIT_DEFAULT,
  type TimelineEntry,
  type TimelineQuery,
  eventIdParamSchema,
  exportQuerySchema,
  positionsQuerySchema,
  timelineQuerySchema,
} from './dto/aar.dto';
import { AarService } from './aar.service';

function parse<T>(schema: ZodSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(result.error.flatten());
  }
  return result.data;
}

function parseTimelineQuery(value: unknown): TimelineQuery {
  const dto = parse(timelineQuerySchema, value ?? {});
  return {
    fromAt: dto.fromAt ?? null,
    toAt: dto.toAt ?? null,
    limit: dto.limit ?? TIMELINE_LIMIT_DEFAULT,
  };
}

function parsePositionsQuery(value: unknown): PositionsQuery {
  const dto = parse(positionsQuerySchema, value ?? {});
  return {
    operatorId: dto.operatorId ?? null,
    fromAt: dto.fromAt ?? null,
    toAt: dto.toAt ?? null,
    cursor: dto.cursor ?? null,
    limit: dto.limit ?? POSITIONS_LIMIT_DEFAULT,
  };
}

function parseExportQuery(value: unknown): ExportQuery {
  const dto = parse(exportQuerySchema, value ?? {});
  return { includeTimeline: coerceBool(dto.includeTimeline, true) };
}

/**
 * Express delivers query string values as raw strings; Zod accepts a string
 * union OR a real boolean (a Nest-internal caller). `?includeTimeline=` is
 * defaulted to true because the export endpoint's job is to be useful out of
 * the box — admins will rarely want the event-shell-only variant.
 */
function coerceBool(v: boolean | 'true' | 'false' | undefined, fallback: boolean): boolean {
  if (v === undefined) return fallback;
  if (typeof v === 'boolean') return v;
  return v === 'true';
}

@Controller('events/:eventId/aar')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.INSTRUCTOR)
export class AarController {
  constructor(private readonly aar: AarService) {}

  @Get('timeline')
  async timeline(@Param() params: unknown, @Query() query: unknown): Promise<TimelineEntry[]> {
    const { eventId } = parse(eventIdParamSchema, params);
    return this.aar.getTimeline(eventId, parseTimelineQuery(query));
  }

  @Get('positions')
  async positions(@Param() params: unknown, @Query() query: unknown): Promise<PositionsPage> {
    const { eventId } = parse(eventIdParamSchema, params);
    return this.aar.getPositions(eventId, parsePositionsQuery(query));
  }

  @Get('export')
  async export(@Param() params: unknown, @Query() query: unknown): Promise<ExportView> {
    const { eventId } = parse(eventIdParamSchema, params);
    return this.aar.exportEvent(eventId, parseExportQuery(query));
  }
}
