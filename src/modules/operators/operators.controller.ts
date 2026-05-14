import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { ZodSchema } from 'zod';

import type { AuthenticatedUser } from '../auth/dto/auth.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  type OperatorView,
  createOperatorSchema,
  operatorIdParamSchema,
  updateOperatorSchema,
} from './dto/operators.dto';
import { OperatorsService } from './operators.service';

function parse<T>(schema: ZodSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(result.error.flatten().fieldErrors);
  }
  return result.data;
}

@Controller('operators')
@UseGuards(JwtAuthGuard)
export class OperatorsController {
  constructor(private readonly operators: OperatorsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<OperatorView> {
    return this.operators.createForUser(user.id, parse(createOperatorSchema, body));
  }

  @Get('me')
  async getMe(@CurrentUser() user: AuthenticatedUser): Promise<OperatorView> {
    return this.operators.getByUserId(user.id);
  }

  @Patch('me')
  async updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<OperatorView> {
    return this.operators.updateForUser(user.id, parse(updateOperatorSchema, body));
  }

  @Get(':id')
  async getById(@Param() params: unknown): Promise<OperatorView> {
    const { id } = parse(operatorIdParamSchema, params);
    return this.operators.getById(id);
  }
}
