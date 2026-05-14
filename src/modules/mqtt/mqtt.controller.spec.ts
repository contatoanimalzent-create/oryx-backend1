import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MqttController } from './mqtt.controller';
import { MqttService } from './mqtt.service';

const USER = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'op@oryx.app',
  displayName: 'Op',
  role: Role.OPERATOR,
};

describe('MqttController', () => {
  let controller: MqttController;
  let service: { issueForUser: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    service = { issueForUser: vi.fn() };
    const moduleRef = await Test.createTestingModule({
      controllers: [MqttController],
      providers: [{ provide: MqttService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(MqttController);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards the current user id to the service', async () => {
    service.issueForUser.mockResolvedValue({
      url: 'wss://iot.stub.local/mqtt?clientId=op',
      clientId: 'op',
      topicPrefix: 'oryx/positions/evt/op',
      expiresAt: new Date().toISOString(),
      mode: 'stub',
    });

    await controller.issue(USER);

    expect(service.issueForUser).toHaveBeenCalledWith(USER.id);
  });

  it('returns the credentials view as-is', async () => {
    const view = {
      url: 'wss://iot.stub.local/mqtt?clientId=op',
      clientId: 'op',
      topicPrefix: 'oryx/positions/evt/op',
      expiresAt: new Date().toISOString(),
      mode: 'stub' as const,
    };
    service.issueForUser.mockResolvedValue(view);

    const result = await controller.issue(USER);

    expect(result).toEqual(view);
  });
});
