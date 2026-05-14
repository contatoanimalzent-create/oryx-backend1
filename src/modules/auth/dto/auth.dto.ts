import { Role } from '@prisma/client';
import { z } from 'zod';

// Re-export Role so consumers (decorators, controllers) avoid the
// "@prisma/client deep import" everywhere.
export { Role };

// Zod schemas live at the HTTP boundary (CLAUDE.md §3.3 layer 1).
// class-validator DTOs are kept lightweight because controllers parse
// the body via Zod before reaching service code.

const PASSWORD_MIN = 12;
const PASSWORD_MAX = 256;
const DISPLAY_NAME_MIN = 2;
const DISPLAY_NAME_MAX = 80;

export const registerSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
  displayName: z.string().trim().min(DISPLAY_NAME_MIN).max(DISPLAY_NAME_MAX),
});

export const loginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1).max(PASSWORD_MAX),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const logoutSchema = refreshSchema;

export type RegisterDto = z.infer<typeof registerSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
export type RefreshDto = z.infer<typeof refreshSchema>;
export type LogoutDto = z.infer<typeof logoutSchema>;

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
}

export interface AuthResponse {
  user: AuthenticatedUser;
  tokens: TokenPair;
}
