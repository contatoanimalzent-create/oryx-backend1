import { type ExecutionContext, createParamDecorator } from '@nestjs/common';

import type { AuthenticatedUser } from '../dto/auth.dto';

/**
 * Extracts the authenticated user populated by JwtStrategy.validate().
 * Use only on routes guarded by JwtAuthGuard — outside that, the request
 * has no user attached and this returns undefined.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    return request.user;
  },
);
