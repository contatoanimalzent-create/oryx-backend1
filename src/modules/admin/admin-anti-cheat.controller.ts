import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { z } from 'zod';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminService } from './admin.service';

const resolveSchema = z.object({
  action: z.enum(['CONFIRM', 'DISMISS']),
});

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/anti-cheat')
export class AdminAntiCheatController {
  constructor(private readonly admin: AdminService) {}

  @Get('suspicions')
  list(@Query('status') status?: string) {
    return this.admin.listSuspicions(status);
  }

  @Patch('suspicions/:id')
  @HttpCode(HttpStatus.OK)
  resolve(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const dto = resolveSchema.parse(body);
    return this.admin.resolveSuspicion(id, dto.action, userId);
  }
}
