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
  type ZoneView,
  createZoneSchema,
  eventIdParamSchema,
  updateZoneSchema,
  zoneIdParamSchema,
} from './dto/zones.dto';
import { ZonesService } from './zones.service';

function parse<T>(schema: ZodSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(result.error.flatten());
  }
  return result.data;
}

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ZonesController {
  constructor(private readonly zones: ZonesService) {}

  @Post('events/:eventId/zones')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async create(@Param() params: unknown, @Body() body: unknown): Promise<ZoneView> {
    const { eventId } = parse(eventIdParamSchema, params);
    return this.zones.createForEvent(eventId, parse(createZoneSchema, body));
  }

  @Get('events/:eventId/zones')
  async listByEvent(@Param() params: unknown): Promise<ZoneView[]> {
    const { eventId } = parse(eventIdParamSchema, params);
    return this.zones.listByEvent(eventId);
  }

  @Get('zones/:id')
  async getById(@Param() params: unknown): Promise<ZoneView> {
    const { id } = parse(zoneIdParamSchema, params);
    return this.zones.getById(id);
  }

  @Patch('zones/:id')
  @Roles(Role.ADMIN)
  async update(@Param() params: unknown, @Body() body: unknown): Promise<ZoneView> {
    const { id } = parse(zoneIdParamSchema, params);
    return this.zones.update(id, parse(updateZoneSchema, body));
  }

  @Delete('zones/:id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param() params: unknown): Promise<void> {
    const { id } = parse(zoneIdParamSchema, params);
    await this.zones.remove(id);
  }
}
