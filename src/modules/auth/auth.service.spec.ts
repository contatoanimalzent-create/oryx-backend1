import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';

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

describe('AuthService', () => {
  let service: AuthService;
  let repo: {
    findUserByEmail: ReturnType<typeof vi.fn>;
    findUserById: ReturnType<typeof vi.fn>;
    createUser: ReturnType<typeof vi.fn>;
    createRefreshToken: ReturnType<typeof vi.fn>;
    findActiveRefreshToken: ReturnType<typeof vi.fn>;
    revokeRefreshToken: ReturnType<typeof vi.fn>;
    rotateRefreshToken: ReturnType<typeof vi.fn>;
  };

  beforeAll(() => {
    Object.assign(process.env, TEST_ENV);
  });

  beforeEach(async () => {
    repo = {
      findUserByEmail: vi.fn(),
      findUserById: vi.fn(),
      createUser: vi.fn(),
      createRefreshToken: vi.fn(),
      findActiveRefreshToken: vi.fn(),
      revokeRefreshToken: vi.fn(),
      rotateRefreshToken: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      providers: [AuthService, { provide: AuthRepository, useValue: repo }],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── register ────────────────────────────────────────────────────────────

  describe('register', () => {
    it('creates a new user, hashes the password, and issues tokens', async () => {
      repo.findUserByEmail.mockResolvedValue(null);
      repo.createUser.mockImplementation(
        (data: { email: string; passwordHash: string; displayName: string }) =>
          Promise.resolve({
            id: 'user-1',
            email: data.email,
            passwordHash: data.passwordHash,
            displayName: data.displayName,
            role: Role.OPERATOR,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
      );
      repo.createRefreshToken.mockResolvedValue({});

      const result = await service.register({
        email: 'op1@oryx.app',
        password: 'a-very-strong-password',
        displayName: 'Op One',
      });

      expect(result.user).toEqual({
        id: 'user-1',
        email: 'op1@oryx.app',
        displayName: 'Op One',
        role: Role.OPERATOR,
      });
      expect(result.tokens.accessToken).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
      expect(result.tokens.refreshToken).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);

      // Access token must carry the role claim so RolesGuard sees it.
      const decoded = JSON.parse(
        Buffer.from(result.tokens.accessToken.split('.')[1], 'base64url').toString(),
      ) as { role?: Role; type?: string };
      expect(decoded.role).toBe(Role.OPERATOR);
      expect(decoded.type).toBe('access');

      // Password hash must NOT be the plain password.
      const createCall = repo.createUser.mock.calls[0][0] as { passwordHash: string };
      expect(createCall.passwordHash).not.toBe('a-very-strong-password');
      expect(await argon2.verify(createCall.passwordHash, 'a-very-strong-password')).toBe(true);

      // Refresh token must be persisted as a hash, not raw.
      const tokenCall = repo.createRefreshToken.mock.calls[0][0] as { tokenHash: string };
      expect(tokenCall.tokenHash).not.toBe(result.tokens.refreshToken);
      expect(tokenCall.tokenHash).toMatch(/^[a-f0-9]{64}$/); // sha256 hex
    });

    it('rejects when email is already registered', async () => {
      repo.findUserByEmail.mockResolvedValue({ id: 'existing', email: 'taken@oryx.app' });

      await expect(
        service.register({
          email: 'taken@oryx.app',
          password: 'long-enough-password',
          displayName: 'X',
        }),
      ).rejects.toThrow(/already registered/i);

      expect(repo.createUser).not.toHaveBeenCalled();
    });
  });

  // ─── login ───────────────────────────────────────────────────────────────

  describe('login', () => {
    it('issues tokens for valid credentials and includes role claim', async () => {
      const passwordHash = await argon2.hash('correct-horse-battery-staple');
      repo.findUserByEmail.mockResolvedValue({
        id: 'user-2',
        email: 'op2@oryx.app',
        passwordHash,
        displayName: 'Op Two',
        role: Role.SQUAD_LEADER,
      });
      repo.createRefreshToken.mockResolvedValue({});

      const result = await service.login({
        email: 'op2@oryx.app',
        password: 'correct-horse-battery-staple',
      });

      expect(result.user.id).toBe('user-2');
      expect(result.user.role).toBe(Role.SQUAD_LEADER);

      const decoded = JSON.parse(
        Buffer.from(result.tokens.accessToken.split('.')[1], 'base64url').toString(),
      ) as { role?: Role };
      expect(decoded.role).toBe(Role.SQUAD_LEADER);
    });

    it('rejects with the same message for missing user and wrong password', async () => {
      repo.findUserByEmail.mockResolvedValue(null);
      const noUser = service
        .login({ email: 'nobody@oryx.app', password: 'whatever' })
        .catch((err: Error) => err.message);

      const passwordHash = await argon2.hash('the-real-password');
      repo.findUserByEmail.mockResolvedValueOnce({
        id: 'u',
        email: 'someone@oryx.app',
        passwordHash,
        displayName: 'X',
        role: Role.OPERATOR,
      });
      const wrongPassword = service
        .login({ email: 'someone@oryx.app', password: 'wrong' })
        .catch((err: Error) => err.message);

      expect(await noUser).toBe(await wrongPassword);
    });
  });

  // ─── refresh ─────────────────────────────────────────────────────────────

  describe('refresh', () => {
    it('rejects malformed tokens', async () => {
      await expect(service.refresh('not-a-jwt')).rejects.toThrow(/invalid or expired/i);
    });

    it('rejects access tokens used as refresh tokens', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [JwtModule.register({})],
      }).compile();
      const jwt = moduleRef.get(JwtService);
      const accessToken = await jwt.signAsync(
        { sub: 'user-x', type: 'access' },
        { secret: TEST_ENV.JWT_REFRESH_SECRET, expiresIn: '15m' },
      );

      await expect(service.refresh(accessToken)).rejects.toThrow(/wrong token type/i);
    });

    it('rotates: revokes old token and creates new one atomically', async () => {
      // Register first to get a real refresh token.
      repo.findUserByEmail.mockResolvedValue(null);
      repo.createUser.mockResolvedValue({
        id: 'user-3',
        email: 'op3@oryx.app',
        passwordHash: 'irrelevant',
        displayName: 'Op Three',
        role: Role.OPERATOR,
      });
      let storedHash = '';
      let storedId = '';
      repo.createRefreshToken.mockImplementation((data: { id: string; tokenHash: string }) => {
        storedId = data.id;
        storedHash = data.tokenHash;
        return Promise.resolve(data);
      });

      const registered = await service.register({
        email: 'op3@oryx.app',
        password: 'long-enough-password',
        displayName: 'Op Three',
      });

      // Refresh setup.
      repo.findActiveRefreshToken.mockResolvedValue({
        id: storedId,
        userId: 'user-3',
        tokenHash: storedHash,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
      });
      repo.findUserById.mockResolvedValue({
        id: 'user-3',
        email: 'op3@oryx.app',
        passwordHash: 'irrelevant',
        displayName: 'Op Three',
        role: Role.OPERATOR,
      });
      repo.rotateRefreshToken.mockResolvedValue({});

      const refreshed = await service.refresh(registered.tokens.refreshToken);

      expect(refreshed.tokens.refreshToken).not.toBe(registered.tokens.refreshToken);
      expect(repo.rotateRefreshToken).toHaveBeenCalledTimes(1);
      const rotateCall = repo.rotateRefreshToken.mock.calls[0];
      expect(rotateCall[0]).toBe(storedId);
    });

    it('rejects when stored token has been revoked', async () => {
      repo.findUserByEmail.mockResolvedValue(null);
      repo.createUser.mockResolvedValue({
        id: 'user-4',
        email: 'op4@oryx.app',
        passwordHash: 'x',
        displayName: 'X',
        role: Role.OPERATOR,
      });
      repo.createRefreshToken.mockResolvedValue({});
      const registered = await service.register({
        email: 'op4@oryx.app',
        password: 'long-enough-password',
        displayName: 'X',
      });

      repo.findActiveRefreshToken.mockResolvedValue(null); // simulating revoked / expired

      await expect(service.refresh(registered.tokens.refreshToken)).rejects.toThrow(
        /revoked or unknown/i,
      );
    });
  });

  // ─── logout ──────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('revokes the refresh token if present', async () => {
      repo.findActiveRefreshToken.mockResolvedValue({ id: 'rt-1' });
      repo.revokeRefreshToken.mockResolvedValue({});

      await service.logout('whatever');

      expect(repo.revokeRefreshToken).toHaveBeenCalledWith('rt-1');
    });

    it('is a no-op when token is unknown', async () => {
      repo.findActiveRefreshToken.mockResolvedValue(null);
      await service.logout('whatever');
      expect(repo.revokeRefreshToken).not.toHaveBeenCalled();
    });
  });
});
