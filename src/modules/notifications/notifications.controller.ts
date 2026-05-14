import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
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
  type DeviceTokenView,
  type NotificationView,
  createNotificationSchema,
  registerDeviceSchema,
  unregisterDeviceSchema,
} from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';

function parse<T>(schema: ZodSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(result.error.flatten());
  }
  return result.data;
}

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  // ─── Admin: create + dispatch ──────────────────────────────────────────

  @Post()
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.ACCEPTED)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<NotificationView> {
    return this.notifications.create(parse(createNotificationSchema, body), user.id);
  }

  // ─── Any auth user: own device tokens ──────────────────────────────────

  @Post('devices')
  @HttpCode(HttpStatus.CREATED)
  async registerDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<DeviceTokenView> {
    return this.notifications.registerDevice(user.id, parse(registerDeviceSchema, body));
  }

  @Delete('devices')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unregisterDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<void> {
    const dto = parse(unregisterDeviceSchema, body);
    await this.notifications.unregisterDevice(user.id, dto.token);
  }
}
