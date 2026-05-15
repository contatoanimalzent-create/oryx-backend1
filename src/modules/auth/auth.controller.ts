import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';

import type { ZodSchema } from 'zod';

import {
  type AuthResponse,
  type AuthenticatedUser,
  type EmailVerificationResponse,
  type IdentityVerificationResponse,
  type PasswordResetRequestResponse,
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  verifyIdentitySchema,
} from './dto/auth.dto';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

function parseBody<T>(schema: ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(result.error.flatten().fieldErrors);
  }
  return result.data;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() body: unknown): Promise<AuthResponse> {
    return this.auth.register(parseBody(registerSchema, body));
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: unknown): Promise<AuthResponse> {
    return this.auth.login(parseBody(loginSchema, body));
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() body: unknown): Promise<AuthResponse> {
    const dto = parseBody(refreshSchema, body);
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() body: unknown): Promise<void> {
    const dto = parseBody(logoutSchema, body);
    await this.auth.logout(dto.refreshToken);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  forgotPassword(@Body() body: unknown): Promise<PasswordResetRequestResponse> {
    return this.auth.forgotPassword(parseBody(forgotPasswordSchema, body));
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(@Body() body: unknown): Promise<void> {
    await this.auth.resetPassword(parseBody(resetPasswordSchema, body));
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() body: unknown): Promise<EmailVerificationResponse> {
    const dto = parseBody(verifyEmailSchema, body);
    return this.auth.verifyEmail(dto.token);
  }

  @Post('verify-identity')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  verifyIdentity(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<IdentityVerificationResponse> {
    return this.auth.verifyIdentity(user.id, parseBody(verifyIdentitySchema, body));
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
