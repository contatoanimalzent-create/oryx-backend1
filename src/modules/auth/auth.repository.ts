import { Injectable } from '@nestjs/common';
import type {
  EmailVerificationToken,
  IdentityVerification,
  PasswordResetToken,
  Prisma,
  RefreshToken,
  User,
} from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── User ──────────────────────────────────────────────────────────────

  findUserByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findUserById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  createUser(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({ data });
  }

  // ─── Refresh tokens ────────────────────────────────────────────────────

  createRefreshToken(data: Prisma.RefreshTokenUncheckedCreateInput): Promise<RefreshToken> {
    return this.prisma.refreshToken.create({ data });
  }

  findActiveRefreshToken(tokenHash: string): Promise<RefreshToken | null> {
    return this.prisma.refreshToken.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
  }

  revokeRefreshToken(id: string): Promise<RefreshToken> {
    return this.prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Atomically rotate: revoke the old token and create the new one in the
   * same transaction so a failure mid-rotate cannot leave the user with
   * neither (or both) usable.
   */
  async rotateRefreshToken(
    oldId: string,
    newToken: Prisma.RefreshTokenUncheckedCreateInput,
  ): Promise<RefreshToken> {
    const [, created] = await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: oldId },
        data: { revokedAt: new Date() },
      }),
      this.prisma.refreshToken.create({ data: newToken }),
    ]);
    return created;
  }

  // Auth recovery / verification

  updateUserPassword(userId: string, passwordHash: string): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  createPasswordResetToken(
    data: Prisma.PasswordResetTokenUncheckedCreateInput,
  ): Promise<PasswordResetToken> {
    return this.prisma.passwordResetToken.create({ data });
  }

  findActivePasswordResetToken(tokenHash: string): Promise<PasswordResetToken | null> {
    return this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
  }

  async usePasswordResetToken(id: string, userId: string, passwordHash: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  createEmailVerificationToken(
    data: Prisma.EmailVerificationTokenUncheckedCreateInput,
  ): Promise<EmailVerificationToken> {
    return this.prisma.emailVerificationToken.create({ data });
  }

  findActiveEmailVerificationToken(tokenHash: string): Promise<EmailVerificationToken | null> {
    return this.prisma.emailVerificationToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
  }

  useEmailVerificationToken(id: string): Promise<EmailVerificationToken> {
    return this.prisma.emailVerificationToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }

  createIdentityVerification(
    data: Prisma.IdentityVerificationUncheckedCreateInput,
  ): Promise<IdentityVerification> {
    return this.prisma.identityVerification.create({ data });
  }
}
