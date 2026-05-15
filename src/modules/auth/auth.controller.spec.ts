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
    forgotPassword: ReturnType<typeof vi.fn>;
    resetPassword: ReturnType<typeof vi.fn>;
    verifyEmail: ReturnType<typeof vi.fn>;
    verifyIdentity: ReturnType<typeof vi.fn>;
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
      forgotPassword: vi.fn(),
      resetPassword: vi.fn(),
      verifyEmail: vi.fn(),
      verifyIdentity: vi.fn(),
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

  describe('POST /auth/forgot-password', () => {
    it('forwards parsed email', async () => {
      service.forgotPassword.mockResolvedValue({ status: 'accepted' });
      await controller.forgotPassword({ email: 'OP@ORYX.APP' });
      expect(service.forgotPassword).toHaveBeenCalledWith({ email: 'op@oryx.app' });
    });
  });

  describe('POST /auth/reset-password', () => {
    it('forwards token and new password', async () => {
      service.resetPassword.mockResolvedValue(undefined);
      await controller.resetPassword({
        token: 'x'.repeat(32),
        password: 'new-strong-password',
      });
      expect(service.resetPassword).toHaveBeenCalledWith({
        token: 'x'.repeat(32),
        password: 'new-strong-password',
      });
    });
  });

  describe('POST /auth/verify-email', () => {
    it('forwards token', async () => {
      service.verifyEmail.mockResolvedValue({ status: 'verified' });
      await controller.verifyEmail({ token: 'x'.repeat(32) });
      expect(service.verifyEmail).toHaveBeenCalledWith('x'.repeat(32));
    });
  });

  describe('POST /auth/verify-identity', () => {
    it('forwards current user id and identity payload', async () => {
      service.verifyIdentity.mockResolvedValue({
        id: 'verification-1',
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      });

      await controller.verifyIdentity(
        { id: 'u-1', email: 'op@oryx.app', displayName: 'Op', role: Role.OPERATOR },
        {
          cpf: '12345678901',
          documentType: 'rg',
          documentFrontUrl: 'https://cdn.oryxcontrol.com/doc-front.jpg',
          selfieUrl: 'https://cdn.oryxcontrol.com/selfie.jpg',
        },
      );

      expect(service.verifyIdentity).toHaveBeenCalledWith('u-1', {
        cpf: '12345678901',
        documentType: 'rg',
        documentFrontUrl: 'https://cdn.oryxcontrol.com/doc-front.jpg',
        selfieUrl: 'https://cdn.oryxcontrol.com/selfie.jpg',
      });
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
