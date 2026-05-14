import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
  type OperatorReputationView,
  type ReputationLogView,
  createReputationLogSchema,
  operatorIdParamSchema,
} from './dto/reputation.dto';
import { ReputationService } from './reputation.service';

function parse<T>(schema: ZodSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(result.error.flatten());
  }
  return result.data;
}

/**
 * Administrative endpoints for operator reputation. ADMIN/INSTRUCTOR only —
 * operator self-view is part of the mobile profile screen (Fase 2.13) and will
 * land its own endpoint then.
 */
@Controller('operators/:operatorId/reputation')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.INSTRUCTOR)
export class ReputationController {
  constructor(private readonly reputation: ReputationService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async record(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: unknown,
    @Body() body: unknown,
  ): Promise<ReputationLogView> {
    const { operatorId } = parse(operatorIdParamSchema, params);
    return this.reputation.recordEntry(operatorId, parse(createReputationLogSchema, body), user.id);
  }

  @Get()
  async get(@Param() params: unknown): Promise<OperatorReputationView> {
    const { operatorId } = parse(operatorIdParamSchema, params);
    return this.reputation.getOperatorReputation(operatorId);
  }
}
