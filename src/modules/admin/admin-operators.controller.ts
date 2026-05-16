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
import { OperatorStatus, Role } from '@prisma/client';
import { z } from 'zod';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminService } from './admin.service';

const setStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
});

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/operators')
export class AdminOperatorsController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  list(@Query('q') q?: string, @Query('take') take?: string) {
    return this.admin.searchOperators(q, take ? Number(take) : undefined);
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const dto = setStatusSchema.parse(body);
    return this.admin.setOperatorStatus(id, dto.status as OperatorStatus);
  }
}
