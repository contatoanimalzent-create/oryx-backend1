import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import type { AuthenticatedUser } from '../dto/auth.dto';
import { RolesGuard } from './roles.guard';

function makeContext(user?: AuthenticatedUser): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => () => undefined,
    getClass: () => class Stub {},
  } as unknown as ExecutionContext;
}

function makeReflector(roles: Role[] | undefined): Reflector {
  return {
    getAllAndOverride: () => roles,
  } as unknown as Reflector;
}

describe('RolesGuard', () => {
  it('passes when no @Roles annotation is present', () => {
    const guard = new RolesGuard(makeReflector(undefined));
    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it('passes when @Roles is empty', () => {
    const guard = new RolesGuard(makeReflector([]));
    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it('throws Forbidden when no user is on the request', () => {
    const guard = new RolesGuard(makeReflector([Role.ADMIN]));
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });

  it('throws Forbidden when user role is not in the allowed list', () => {
    const guard = new RolesGuard(makeReflector([Role.ADMIN, Role.INSTRUCTOR]));
    const user: AuthenticatedUser = {
      id: 'u',
      email: 'op@oryx.app',
      displayName: 'Op',
      role: Role.OPERATOR,
    };
    expect(() => guard.canActivate(makeContext(user))).toThrow(ForbiddenException);
  });

  it('passes when user role matches one of the allowed roles', () => {
    const guard = new RolesGuard(makeReflector([Role.ADMIN, Role.INSTRUCTOR]));
    const user: AuthenticatedUser = {
      id: 'u',
      email: 'op@oryx.app',
      displayName: 'Op',
      role: Role.INSTRUCTOR,
    };
    expect(guard.canActivate(makeContext(user))).toBe(true);
  });
});
