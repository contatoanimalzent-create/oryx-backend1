import { Injectable, NotFoundException } from '@nestjs/common';
import { MediaKind } from '@prisma/client';
import { randomBytes } from 'node:crypto';

import { PrismaService } from '../../shared/database/prisma.service';

interface PresignParams {
  uploaderId: string;
  kind: MediaKind;
  mimeType: string;
  filenameHint?: string;
}

/**
 * Issues presigned upload URLs for client-direct upload to S3/Cloudinary.
 *
 * Stub today: returns a fake URL + creates a MediaUpload row. Real impl
 * will sign via @aws-sdk/client-s3 PutObjectCommand + getSignedUrl.
 *
 * TODO(deploy): pull AWS_S3_BUCKET + AWS_REGION from env, sign with STS.
 */
@Injectable()
export class MediaStorageService {
  constructor(private readonly prisma: PrismaService) {}

  async presignUpload(params: PresignParams) {
    const ext = this.extFromMime(params.mimeType);
    const storageKey = this.makeKey(params);
    const row = await this.prisma.mediaUpload.create({
      data: {
        uploaderId: params.uploaderId,
        kind: params.kind,
        storageKey: `${storageKey}.${ext}`,
        mimeType: params.mimeType,
      },
    });
    // Stub URL: same shape S3 presigned URLs have. Client PUTs the bytes here.
    const uploadUrl =
      `https://oryx-media.stub.local/${row.storageKey}` +
      `?X-Amz-Algorithm=AWS4-HMAC-SHA256-STUB` +
      `&X-Amz-Expires=900` +
      `&uploadId=${row.id}`;
    return {
      uploadId: row.id,
      uploadUrl,
      method: 'PUT',
      headers: { 'Content-Type': params.mimeType },
      expiresInSeconds: 900,
    };
  }

  async confirmUpload(uploadId: string, sizeBytes: number) {
    const row = await this.prisma.mediaUpload.findUnique({
      where: { id: uploadId },
    });
    if (!row) throw new NotFoundException('Upload not found.');
    return this.prisma.mediaUpload.update({
      where: { id: uploadId },
      data: {
        confirmed: true,
        sizeBytes,
        publicUrl: `https://media.oryxcontrol.com/${row.storageKey}`,
      },
    });
  }

  private makeKey(p: PresignParams): string {
    const slug = (p.filenameHint ?? 'file')
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .slice(0, 32);
    const rand = randomBytes(6).toString('hex');
    const folder = p.kind.toLowerCase();
    return `${folder}/${p.uploaderId}/${rand}-${slug}`;
  }

  private extFromMime(mime: string): string {
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'application/pdf': 'pdf',
    };
    return map[mime] ?? 'bin';
  }
}
