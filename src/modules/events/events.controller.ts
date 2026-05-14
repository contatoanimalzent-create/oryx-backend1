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

import type { AuthenticatedUser } from '../auth/dto/auth.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  type EventView,
  createEventSchema,
  eventIdParamSchema,
  eventListQuerySchema,
  updateEventSchema,
} from './dto/events.dto';
import { EventsService } from './events.service';

function parse<T>(schema: ZodSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(result.error.flatten());
  }
  return result.data;
}

@Controller('events')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post()
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown): Promise<EventView> {
    return this.events.create(user.id, parse(createEventSchema, body));
  }

  @Get()
  async list(@Query() query: unknown): Promise<EventView[]> {
    return this.events.list(parse(eventListQuerySchema, query ?? {}));
  }

  @Get(':id')
  async getById(@Param() params: unknown): Promise<EventView> {
    const { id } = parse(eventIdParamSchema, params);
    return this.events.getById(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  async update(@Param() params: unknown, @Body() body: unknown): Promise<EventView> {
    const { id } = parse(eventIdParamSchema, params);
    return this.events.update(id, parse(updateEventSchema, body));
  }

  @Post(':id/activate')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  async activate(@Param() params: unknown): Promise<EventView> {
    const { id } = parse(eventIdParamSchema, params);
    return this.events.activate(id);
  }

  @Post(':id/end')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  async end(@Param() params: unknown): Promise<EventView> {
    const { id } = parse(eventIdParamSchema, params);
    return this.events.end(id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param() params: unknown): Promise<void> {
    const { id } = parse(eventIdParamSchema, params);
    await this.events.remove(id);
  }
}
