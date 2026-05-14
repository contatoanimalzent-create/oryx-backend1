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
  type ExerciseView,
  classIdInPathSchema,
  createExerciseSchema,
  exerciseIdParamSchema,
  updateExerciseSchema,
} from './dto/tactical.dto';
import { TacticalService } from './tactical.service';

function parse<T>(schema: ZodSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(result.error.flatten());
  }
  return result.data;
}

@Controller('tactical')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.INSTRUCTOR)
export class ExercisesController {
  constructor(private readonly tactical: TacticalService) {}

  @Post('classes/:classId/exercises')
  @Roles(Role.ADMIN, Role.INSTRUCTOR)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: unknown,
    @Body() body: unknown,
  ): Promise<ExerciseView> {
    const { classId } = parse(classIdInPathSchema, params);
    return this.tactical.createExercise(user, classId, parse(createExerciseSchema, body));
  }

  @Get('classes/:classId/exercises')
  async listByClass(@Param() params: unknown): Promise<ExerciseView[]> {
    const { classId } = parse(classIdInPathSchema, params);
    return this.tactical.listExercisesByClass(classId);
  }

  @Get('exercises/:id')
  async getById(@Param() params: unknown): Promise<ExerciseView> {
    const { id } = parse(exerciseIdParamSchema, params);
    return this.tactical.getExercise(id);
  }

  @Patch('exercises/:id')
  @Roles(Role.ADMIN, Role.INSTRUCTOR)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: unknown,
    @Body() body: unknown,
  ): Promise<ExerciseView> {
    const { id } = parse(exerciseIdParamSchema, params);
    return this.tactical.updateExercise(user, id, parse(updateExerciseSchema, body));
  }

  @Delete('exercises/:id')
  @Roles(Role.ADMIN, Role.INSTRUCTOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param() params: unknown): Promise<void> {
    const { id } = parse(exerciseIdParamSchema, params);
    await this.tactical.deleteExercise(user, id);
  }
}
