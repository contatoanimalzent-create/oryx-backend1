import { createHash, randomUUID } from 'node:crypto';

import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as argon2 from 'argon2';

import { loadEnv } from '../../config/env';
import type {
  AuthResponse,
  AuthenticatedUser,
  LoginDto,
  RegisterDto,
  TokenPair,
} from './dto/auth.dto';
import { AuthRepository } from './auth.repository';

export interface AccessTokenClaims {
  sub: string; // userId
  role: Role;
  type: 'access';
}

interface RefreshTokenClaims {
  sub: string;
  jti: string; // refresh token row id (DB)
  type: 'refresh';
}

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MB — OWASP 2024 recommended floor
  timeCost: 2,
  parallelism: 1,
} as const;

function hashRefresh(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly env = loadEnv();

  constructor(
    private readonly repository: AuthRepository,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existing = await this.repository.findUserByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email already registered.');
    }

    const passwordHash = await argon2.hash(dto.password, ARGON2_OPTIONS);

    const user = await this.repository.createUser({
      email: dto.email,
      passwordHash,
      displayName: dto.displayName,
    });

    const tokens = await this.issueTokens(user.id, user.role);

    return { user: this.toAuthenticatedUser(user), tokens };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.repository.findUserByEmail(dto.email);
    if (!user) {
      // Same error for missing user and wrong password — don't leak which.
      throw new UnauthorizedException('Invalid credentials.');
    }

    const ok = await argon2.verify(user.passwordHash, dto.password);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const tokens = await this.issueTokens(user.id, user.role);
    return { user: this.toAuthenticatedUser(user), tokens };
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    let claims: RefreshTokenClaims;
    try {
      claims = await this.jwt.verifyAsync<RefreshTokenClaims>(refreshToken, {
        secret: this.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    if (claims.type !== 'refresh') {
      throw new UnauthorizedException('Wrong token type.');
    }

    const stored = await this.repository.findActiveRefreshToken(hashRefresh(refreshToken));
    if (!stored || stored.id !== claims.jti) {
      throw new UnauthorizedException('Refresh token revoked or unknown.');
    }

    const user = await this.repository.findUserById(claims.sub);
    if (!user) {
      throw new UnauthorizedException('User no longer exists.');
    }

    // Atomic rotation prevents the "both old and new are valid" window.
    const newRefresh = await this.signRefresh(user.id);
    await this.repository.rotateRefreshToken(stored.id, {
      id: newRefresh.jti,
      userId: user.id,
      tokenHash: hashRefresh(newRefresh.token),
      expiresAt: newRefresh.expiresAt,
    });

    const access = await this.signAccess(user.id, user.role);

    return {
      user: this.toAuthenticatedUser(user),
      tokens: {
        accessToken: access.token,
        refreshToken: newRefresh.token,
        accessTokenExpiresAt: access.expiresAt.toISOString(),
        refreshTokenExpiresAt: newRefresh.expiresAt.toISOString(),
      },
    };
  }

  async logout(refreshToken: string): Promise<void> {
    // Best-effort revoke. Token may already be expired or unknown — that's
    // a successful logout from the client's perspective either way.
    const stored = await this.repository.findActiveRefreshToken(hashRefresh(refreshToken));
    if (stored) {
      await this.repository.revokeRefreshToken(stored.id);
    }
  }

  async getAuthenticatedUser(userId: string): Promise<AuthenticatedUser> {
    const user = await this.repository.findUserById(userId);
    if (!user) {
      throw new UnauthorizedException('User no longer exists.');
    }
    return this.toAuthenticatedUser(user);
  }

  // ─── Internals ─────────────────────────────────────────────────────────

  private async issueTokens(userId: string, role: Role): Promise<TokenPair> {
    const access = await this.signAccess(userId, role);
    const refresh = await this.signRefresh(userId);

    await this.repository.createRefreshToken({
      id: refresh.jti,
      userId,
      tokenHash: hashRefresh(refresh.token),
      expiresAt: refresh.expiresAt,
    });

    return {
      accessToken: access.token,
      refreshToken: refresh.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      refreshTokenExpiresAt: refresh.expiresAt.toISOString(),
    };
  }

  private async signAccess(
    userId: string,
    role: Role,
  ): Promise<{ token: string; expiresAt: Date }> {
    const claims: AccessTokenClaims = { sub: userId, role, type: 'access' };
    const token = await this.jwt.signAsync(claims, {
      secret: this.env.JWT_ACCESS_SECRET,
      expiresIn: this.env.JWT_ACCESS_TTL,
    });
    return { token, expiresAt: this.expiresAt(token) };
  }

  private async signRefresh(
    userId: string,
  ): Promise<{ token: string; expiresAt: Date; jti: string }> {
    const jti = randomUUID();
    const claims: RefreshTokenClaims = { sub: userId, jti, type: 'refresh' };
    const token = await this.jwt.signAsync(claims, {
      secret: this.env.JWT_REFRESH_SECRET,
      expiresIn: this.env.JWT_REFRESH_TTL,
    });
    return { token, expiresAt: this.expiresAt(token), jti };
  }

  private expiresAt(token: string): Date {
    const decoded: { exp?: number } | null = this.jwt.decode(token);
    if (!decoded || typeof decoded.exp !== 'number') {
      throw new Error('Signed JWT is missing exp claim.');
    }
    return new Date(decoded.exp * 1000);
  }

  private toAuthenticatedUser(user: {
    id: string;
    email: string;
    displayName: string;
    role: Role;
  }): AuthenticatedUser {
    return { id: user.id, email: user.email, displayName: user.displayName, role: user.role };
  }
}
