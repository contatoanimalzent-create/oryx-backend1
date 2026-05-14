import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { ZodSchema } from 'zod';

import type { AuthenticatedUser } from '../auth/dto/auth.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { type IngestAcceptedView, ingestPositionSchema } from './dto/positions.dto';
import { PositionsService } from './positions.service';

function parse<T>(schema: ZodSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(result.error.flatten());
  }
  return result.data;
}

@Controller('positions')
@UseGuards(JwtAuthGuard)
export class PositionsController {
  constructor(private readonly positions: PositionsService) {}

  /**
   * In dev/local the mobile client posts here directly. In production the
   * canonical path is mobile -> MQTT -> AWS IoT Core -> SQS -> worker; this
   * endpoint is a parallel ingestion gate kept for ops/debug. The worker
   * code is identical either way (CLAUDE.md §5.1).
   */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async ingest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<IngestAcceptedView> {
    const dto = parse(ingestPositionSchema, body);
    const { clientEventId } = await this.positions.ingest(user.id, dto);
    return { accepted: true, clientEventId };
  }
}
