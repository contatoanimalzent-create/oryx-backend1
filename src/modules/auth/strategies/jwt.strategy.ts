import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { loadEnv } from '../../../config/env';
import type { AuthenticatedUser } from '../dto/auth.dto';
import { AuthService } from '../auth.service';

interface AccessTokenPayload {
  sub: string;
  role?: Role;
  type?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly auth: AuthService) {
    const env = loadEnv();
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: env.JWT_ACCESS_SECRET,
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    if (payload.type !== 'access') {
      // Refresh tokens must NEVER be accepted on protected routes.
      throw new UnauthorizedException('Wrong token type.');
    }
    // Re-read role from the DB rather than trusting only the claim.
    // Otherwise a demoted admin keeps admin access until token expiry.
    return this.auth.getAuthenticatedUser(payload.sub);
  }
}
