import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

const TEST_ENV = {
  NODE_ENV: 'test',
  PORT: '3000',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://x:x@localhost:5432/x',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL: '30d',
};

describe('AuthController', () => {
  let controller: AuthController;
  let service: {
    register: ReturnType<typeof vi.fn>;
    login: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
    getAuthenticatedUser: ReturnType<typeof vi.fn>;
  };

  beforeAll(() => {
    Object.assign(process.env, TEST_ENV);
  });

  beforeEach(async () => {
    service = {
      register: vi.fn(),
      login: vi.fn(),
      refresh: vi.fn(),
      logout: vi.fn(),
      getAuthenticatedUser: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(AuthController);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /auth/register', () => {
    it('rejects invalid bodies with 400', async () => {
      await expect(
        controller.register({ email: 'not-an-email', password: 'short', displayName: '' }),
      ).rejects.toThrow();
      expect(service.register).not.toHaveBeenCalled();
    });

    it('forwards a valid body to AuthService.register', async () => {
      service.register.mockResolvedValue({ user: { id: 'u' }, tokens: { accessToken: 'a' } });

      const result = await controller.register({
        email: 'OP@ORYX.APP',
        password: 'a-very-strong-password',
        displayName: '  Op  ',
      });

      // Email lowercased, displayName trimmed by Zod.
      expect(service.register).toHaveBeenCalledWith({
        email: 'op@oryx.app',
        password: 'a-very-strong-password',
        displayName: 'Op',
      });
      expect(result.user).toEqual({ id: 'u' });
    });
  });

  describe('POST /auth/login', () => {
    it('forwards parsed credentials', async () => {
      service.login.mockResolvedValue({ user: { id: 'u' }, tokens: { accessToken: 'a' } });
      await controller.login({ email: 'op@oryx.app', password: 'whatever' });
      expect(service.login).toHaveBeenCalledWith({
        email: 'op@oryx.app',
        password: 'whatever',
      });
    });
  });

  describe('POST /auth/refresh', () => {
    it('rejects empty refreshToken', async () => {
      await expect(controller.refresh({ refreshToken: '' })).rejects.toThrow();
    });

    it('forwards token string to service', async () => {
      service.refresh.mockResolvedValue({ user: {}, tokens: {} });
      await controller.refresh({ refreshToken: 'token-x' });
      expect(service.refresh).toHaveBeenCalledWith('token-x');
    });
  });

  describe('POST /auth/logout', () => {
    it('returns void on success', async () => {
      service.logout.mockResolvedValue(undefined);
      await expect(controller.logout({ refreshToken: 't' })).resolves.toBeUndefined();
      expect(service.logout).toHaveBeenCalledWith('t');
    });
  });

  describe('GET /auth/me', () => {
    it('returns the user injected by the guard/decorator (role included)', () => {
      const user = {
        id: 'u-1',
        email: 'op@oryx.app',
        displayName: 'Op',
        role: Role.ADMIN,
      };
      expect(controller.me(user)).toBe(user);
      expect(controller.me(user).role).toBe(Role.ADMIN);
    });
  });
});
