import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { ZodSchema } from 'zod';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  type InstructorAssignmentView,
  assignInstructorSchema,
  instructorMemberParamSchema,
  unitIdInPathSchema,
} from './dto/tactical.dto';
import { TacticalService } from './tactical.service';

function parse<T>(schema: ZodSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(result.error.flatten());
  }
  return result.data;
}

@Controller('tactical/units/:unitId/instructors')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.INSTRUCTOR)
export class InstructorsController {
  constructor(private readonly tactical: TacticalService) {}

  @Post()
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async assign(@Param() params: unknown, @Body() body: unknown): Promise<InstructorAssignmentView> {
    const { unitId } = parse(unitIdInPathSchema, params);
    return this.tactical.assignInstructor(unitId, parse(assignInstructorSchema, body));
  }

  @Get()
  async list(@Param() params: unknown): Promise<InstructorAssignmentView[]> {
    const { unitId } = parse(unitIdInPathSchema, params);
    return this.tactical.listUnitInstructors(unitId);
  }

  @Delete(':userId')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param() params: unknown): Promise<void> {
    const parsed = parse(instructorMemberParamSchema, params);
    await this.tactical.removeInstructor(parsed.unitId, parsed.userId);
  }
}
