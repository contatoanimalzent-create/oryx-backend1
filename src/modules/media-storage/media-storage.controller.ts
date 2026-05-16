import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MediaKind } from '@prisma/client';
import { z } from 'zod';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MediaStorageService } from './media-storage.service';

const presignSchema = z.object({
  kind: z.enum([
    'PROFILE_PHOTO',
    'POST_MEDIA',
    'CLIP',
    'EVIDENCE',
    'DOCUMENT',
  ]),
  mimeType: z.string().regex(/^[a-z]+\/[a-zA-Z0-9._-]+$/),
  filenameHint: z.string().optional(),
});

const confirmSchema = z.object({
  sizeBytes: z.number().int().positive().max(500_000_000),
});

@ApiTags('media-storage')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('media')
export class MediaStorageController {
  constructor(private readonly media: MediaStorageService) {}

  @Post('presign')
  @HttpCode(HttpStatus.CREATED)
  presign(@CurrentUser('id') userId: string, @Body() body: unknown) {
    const dto = presignSchema.parse(body);
    return this.media.presignUpload({
      uploaderId: userId,
      kind: dto.kind as MediaKind,
      mimeType: dto.mimeType,
      filenameHint: dto.filenameHint,
    });
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const dto = confirmSchema.parse(body);
    return this.media.confirmUpload(id, dto.sizeBytes);
  }
}
