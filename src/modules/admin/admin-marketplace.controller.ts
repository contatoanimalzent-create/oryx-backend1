import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminService } from './admin.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/marketplace')
export class AdminMarketplaceController {
  constructor(private readonly admin: AdminService) {}

  @Get('reported')
  reported() {
    return this.admin.listReportedProducts();
  }

  @Delete('products/:id')
  @HttpCode(HttpStatus.OK)
  removeProduct(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.removeProductAsAdmin(id);
  }
}
