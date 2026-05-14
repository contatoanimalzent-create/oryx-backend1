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

import type { AuthenticatedUser } from '../auth/dto/auth.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  type ClassView,
  classIdParamSchema,
  createClassSchema,
  unitIdInPathSchema,
  updateClassSchema,
} from './dto/tactical.dto';
import { TacticalService } from './tactical.service';

function parse<T>(schema: ZodSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(result.error.flatten());
  }
  return result.data;
}

/**
 * RolesGuard narrows to ADMIN/INSTRUCTOR here; the service's
 * `requireInstructorAssoc` ensures an INSTRUCTOR can only manage the units
 * they're explicitly assigned to (admins always pass).
 */
@Controller('tactical')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.INSTRUCTOR)
export class ClassesController {
  constructor(private readonly tactical: TacticalService) {}

  @Post('units/:unitId/classes')
  @Roles(Role.ADMIN, Role.INSTRUCTOR)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: unknown,
    @Body() body: unknown,
  ): Promise<ClassView> {
    const { unitId } = parse(unitIdInPathSchema, params);
    return this.tactical.createClass(user, unitId, parse(createClassSchema, body));
  }

  @Get('units/:unitId/classes')
  async listByUnit(@Param() params: unknown): Promise<ClassView[]> {
    const { unitId } = parse(unitIdInPathSchema, params);
    return this.tactical.listClassesByUnit(unitId);
  }

  @Get('classes/:id')
  async getById(@Param() params: unknown): Promise<ClassView> {
    const { id } = parse(classIdParamSchema, params);
    return this.tactical.getClass(id);
  }

  @Patch('classes/:id')
  @Roles(Role.ADMIN, Role.INSTRUCTOR)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: unknown,
    @Body() body: unknown,
  ): Promise<ClassView> {
    const { id } = parse(classIdParamSchema, params);
    return this.tactical.updateClass(user, id, parse(updateClassSchema, body));
  }

  @Delete('classes/:id')
  @Roles(Role.ADMIN, Role.INSTRUCTOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param() params: unknown): Promise<void> {
    const { id } = parse(classIdParamSchema, params);
    await this.tactical.deleteClass(user, id);
  }
}
