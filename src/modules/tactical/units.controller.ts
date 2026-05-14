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
  type UnitView,
  createUnitSchema,
  unitIdParamSchema,
  updateUnitSchema,
} from './dto/tactical.dto';
import { TacticalService } from './tactical.service';

function parse<T>(schema: ZodSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(result.error.flatten());
  }
  return result.data;
}

@Controller('tactical/units')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.INSTRUCTOR)
export class UnitsController {
  constructor(private readonly tactical: TacticalService) {}

  @Post()
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: unknown): Promise<UnitView> {
    return this.tactical.createUnit(parse(createUnitSchema, body));
  }

  @Get()
  async list(): Promise<UnitView[]> {
    return this.tactical.listUnits();
  }

  @Get(':id')
  async getById(@Param() params: unknown): Promise<UnitView> {
    const { id } = parse(unitIdParamSchema, params);
    return this.tactical.getUnit(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  async update(@Param() params: unknown, @Body() body: unknown): Promise<UnitView> {
    const { id } = parse(unitIdParamSchema, params);
    return this.tactical.updateUnit(id, parse(updateUnitSchema, body));
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param() params: unknown): Promise<void> {
    const { id } = parse(unitIdParamSchema, params);
    await this.tactical.deleteUnit(id);
  }
}
