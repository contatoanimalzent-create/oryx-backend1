import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthService } from '../auth/auth.service';
import { RealtimeGateway } from './realtime.gateway';

const TEST_ENV = {
  NODE_ENV: 'test',
  PORT: '3000',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://x:x@localhost:5432/x',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const OPERATOR_ID = '22222222-2222-2222-2222-222222222222';
const EVENT_ID = '33333333-3333-3333-3333-333333333333';

interface FakeSocket {
  id: string;
  data: Record<string, unknown>;
  handshake: {
    auth?: { token?: string };
    headers: { authorization?: string };
    query?: { token?: string };
  };
  join: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
}

function makeSocket(token?: string, headerToken?: string): FakeSocket {
  return {
    id: 'sock-1',
    data: {},
    handshake: {
      auth: token ? { token } : {},
      headers: headerToken ? { authorization: `Bearer ${headerToken}` } : {},
    },
    join: vi.fn(),
    leave: vi.fn(),
  };
}

type Middleware = (socket: FakeSocket, next: (err?: Error) => void) => unknown;

describe('RealtimeGateway', () => {
  let gateway: RealtimeGateway;
  let jwtService: JwtService;
  let auth: { getAuthenticatedUser: ReturnType<typeof vi.fn> };
  let validToken: string;
  let nonAdminToken: string;

  beforeAll(() => {
    Object.assign(process.env, TEST_ENV);
  });

  beforeEach(async () => {
    jwtService = new JwtService({});
    validToken = await jwtService.signAsync(
      { sub: ADMIN_ID, role: Role.ADMIN, type: 'access' },
      { secret: TEST_ENV.JWT_ACCESS_SECRET, expiresIn: '15m' },
    );
    nonAdminToken = await jwtService.signAsync(
      { sub: OPERATOR_ID, role: Role.OPERATOR, type: 'access' },
      { secret: TEST_ENV.JWT_ACCESS_SECRET, expiresIn: '15m' },
    );

    auth = {
      getAuthenticatedUser: vi.fn().mockImplementation((id: string) => {
        if (id === ADMIN_ID) {
          return Promise.resolve({
            id: ADMIN_ID,
            email: 'admin@oryx.app',
            displayName: 'Admin',
            role: Role.ADMIN,
          });
        }
        return Promise.resolve({
          id: OPERATOR_ID,
          email: 'op@oryx.app',
          displayName: 'Op',
          role: Role.OPERATOR,
        });
      }),
    };

    gateway = new RealtimeGateway(jwtService, auth as unknown as AuthService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handshake middleware', () => {
    function captureMiddleware(): Middleware {
      let captured!: Middleware;
      const fakeServer = { use: (mw: Middleware) => (captured = mw) } as unknown as {
        use: (mw: Middleware) => void;
      };
      gateway.afterInit(fakeServer as never);
      return captured;
    }

    /**
     * The middleware kicks off an async chain that calls `next` from a then
     * handler. We wrap `next` in a Promise so tests resolve once it fires.
     */
    function runMiddleware(middleware: Middleware, socket: FakeSocket): Promise<Error | undefined> {
      return new Promise((resolve) => {
        middleware(socket, (err) => resolve(err));
      });
    }

    it('accepts admin token via handshake.auth.token', async () => {
      const socket = makeSocket(validToken);
      const err = await runMiddleware(captureMiddleware(), socket);
      expect(err).toBeUndefined();
      const data = socket.data as { user?: { id: string; role: Role } };
      expect(data.user?.id).toBe(ADMIN_ID);
    });

    it('accepts admin token via Authorization header', async () => {
      const socket = makeSocket(undefined, validToken);
      const err = await runMiddleware(captureMiddleware(), socket);
      expect(err).toBeUndefined();
    });

    it('rejects when no token is provided', async () => {
      const err = await runMiddleware(captureMiddleware(), makeSocket());
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toMatch(/missing token/);
    });

    it('rejects an invalid token', async () => {
      const err = await runMiddleware(captureMiddleware(), makeSocket('not.a.jwt'));
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toMatch(/invalid|expired/i);
    });

    it('rejects when role is not ADMIN', async () => {
      const err = await runMiddleware(captureMiddleware(), makeSocket(nonAdminToken));
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toMatch(/admin/i);
    });

    it('rejects refresh token used as access', async () => {
      const refreshToken = await jwtService.signAsync(
        { sub: ADMIN_ID, type: 'refresh', jti: 'x' },
        { secret: TEST_ENV.JWT_ACCESS_SECRET, expiresIn: '15m' },
      );
      const err = await runMiddleware(captureMiddleware(), makeSocket(refreshToken));
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toMatch(/wrong token type/);
    });
  });

  describe('subscribe / unsubscribe', () => {
    it('joins the eventId room on subscribe:event', () => {
      const socket = makeSocket();
      const result = gateway.handleSubscribe(socket as never, { eventId: EVENT_ID });
      expect(result).toEqual({ ok: true });
      expect(socket.join).toHaveBeenCalledWith(EVENT_ID);
    });

    it('rejects subscribe with invalid UUID', () => {
      const socket = makeSocket();
      const result = gateway.handleSubscribe(socket as never, { eventId: 'no' });
      expect(result.ok).toBe(false);
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('leaves the room on unsubscribe:event', () => {
      const socket = makeSocket();
      const result = gateway.handleUnsubscribe(socket as never, { eventId: EVENT_ID });
      expect(result).toEqual({ ok: true });
      expect(socket.leave).toHaveBeenCalledWith(EVENT_ID);
    });
  });

  describe('broadcastPosition', () => {
    it('emits "position" to the eventId room', () => {
      const emit = vi.fn();
      const to = vi.fn().mockReturnValue({ emit });
      Object.defineProperty(gateway, 'io', { value: { to }, configurable: true });

      const snapshot = { lat: 1, lon: 2 };
      gateway.broadcastPosition(EVENT_ID, snapshot);

      expect(to).toHaveBeenCalledWith(EVENT_ID);
      expect(emit).toHaveBeenCalledWith('position', snapshot);
    });
  });
});
