import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RedisService } from '../../shared/redis/redis.service';
import type { RealtimeGateway } from './realtime.gateway';
import { RealtimeSubscriber } from './realtime.subscriber';

const EVENT_ID = '11111111-1111-1111-1111-111111111111';

interface FakeSubscriberClient {
  connect: ReturnType<typeof vi.fn>;
  quit: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  psubscribe: ReturnType<typeof vi.fn>;
  __pmessageHandler?: (pattern: string, channel: string, message: string) => void;
}

function makeFakeSubscriberClient(): FakeSubscriberClient {
  const fake: FakeSubscriberClient = {
    connect: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue('OK'),
    psubscribe: vi.fn().mockResolvedValue(1),
    on: vi.fn(),
  };
  fake.on.mockImplementation((event: string, handler: typeof fake.__pmessageHandler) => {
    if (event === 'pmessage') {
      fake.__pmessageHandler = handler;
    }
  });
  return fake;
}

describe('RealtimeSubscriber', () => {
  let subscriber: RealtimeSubscriber;
  let fakeClient: FakeSubscriberClient;
  let gateway: { broadcastPosition: ReturnType<typeof vi.fn> };
  let redis: { getClient: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    fakeClient = makeFakeSubscriberClient();
    gateway = { broadcastPosition: vi.fn() };
    redis = {
      getClient: vi.fn().mockReturnValue({ duplicate: () => fakeClient }),
    };
    subscriber = new RealtimeSubscriber(
      redis as unknown as RedisService,
      gateway as unknown as RealtimeGateway,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('connects, registers pmessage handler and pSubscribes on init', async () => {
    await subscriber.onModuleInit();
    expect(fakeClient.connect).toHaveBeenCalledOnce();
    expect(fakeClient.on).toHaveBeenCalledWith('pmessage', expect.any(Function));
    expect(fakeClient.psubscribe).toHaveBeenCalledWith('event:*:positions');
  });

  it('forwards parsed snapshot to gateway.broadcastPosition', async () => {
    await subscriber.onModuleInit();
    const snapshot = { lat: -23.5, lon: -46.6, operatorId: 'op', eventId: EVENT_ID };
    fakeClient.__pmessageHandler!(
      'event:*:positions',
      `event:${EVENT_ID}:positions`,
      JSON.stringify(snapshot),
    );
    expect(gateway.broadcastPosition).toHaveBeenCalledWith(EVENT_ID, snapshot);
  });

  it('ignores messages whose channel does not match the pattern', async () => {
    await subscriber.onModuleInit();
    fakeClient.__pmessageHandler!('event:*:positions', 'unrelated:channel', JSON.stringify({}));
    expect(gateway.broadcastPosition).not.toHaveBeenCalled();
  });

  it('logs and continues on invalid JSON', async () => {
    await subscriber.onModuleInit();
    fakeClient.__pmessageHandler!('event:*:positions', `event:${EVENT_ID}:positions`, '{ not json');
    expect(gateway.broadcastPosition).not.toHaveBeenCalled();
  });

  it('quits the subscriber on destroy', async () => {
    await subscriber.onModuleInit();
    await subscriber.onModuleDestroy();
    expect(fakeClient.quit).toHaveBeenCalledOnce();
  });
});
