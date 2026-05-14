import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VoiceController } from './voice.controller';
import { VoiceService } from './voice.service';

const USER = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'op@oryx.app',
  displayName: 'Op',
  role: Role.OPERATOR,
};

const SQUAD_ID = '22222222-2222-2222-2222-222222222222';

describe('VoiceController', () => {
  let controller: VoiceController;
  let service: { issueToken: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    service = { issueToken: vi.fn() };
    const moduleRef = await Test.createTestingModule({
      controllers: [VoiceController],
      providers: [{ provide: VoiceService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(VoiceController);
  });

  afterEach(() => vi.restoreAllMocks());

  it('parses the body, forwards userId + dto, and returns the service view', async () => {
    const view = {
      url: 'wss://livekit.stub.local',
      token: 'a.b.c',
      identity: 'operator:ALPHA-1',
      room: `squad:${SQUAD_ID}`,
      canPublish: true,
      canSubscribe: true,
      expiresAt: new Date().toISOString(),
      mode: 'stub' as const,
    };
    service.issueToken.mockResolvedValue(view);

    const result = await controller.issue(USER, { channel: 'SQUAD', channelId: SQUAD_ID });

    expect(service.issueToken).toHaveBeenCalledWith(USER.id, {
      channel: 'SQUAD',
      channelId: SQUAD_ID,
    });
    expect(result).toEqual(view);
  });

  it('rejects malformed body with 400', async () => {
    await expect(
      controller.issue(USER, { channel: 'INVALID', channelId: SQUAD_ID }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects non-uuid channelId with 400', async () => {
    await expect(
      controller.issue(USER, { channel: 'SQUAD', channelId: 'not-a-uuid' }),
    ).rejects.toThrow(BadRequestException);
  });
});
