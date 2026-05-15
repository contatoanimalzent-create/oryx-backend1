import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AccessToken } from 'livekit-server-sdk';
import { EventStatus, Role, SquadStatus } from '@prisma/client';
import { createHash } from 'node:crypto';

import { loadEnv } from '../../config/env';
import { PrismaService } from '../../shared/database/prisma.service';
import { type IssueVoiceTokenDto, type VoiceTokenView } from './dto/voice.dto';

/**
 * Internal permission decision before the token is minted. Identity is a
 * namespaced string ("operator:<callsign>" or "staff:<displayName>") so
 * peers in the same LiveKit room can never collide between an operator
 * and an admin/instructor.
 */
interface AccessDecision {
  identity: string;
  canPublish: boolean;
  canSubscribe: boolean;
}

@Injectable()
export class VoiceService {
  private readonly env = loadEnv();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Issues a per-room LiveKit access token for `userId`.
   *
   * Channel rules:
   *   - SQUAD   : member operators get publish+subscribe; ADMIN/INSTRUCTOR
   *               can observe (subscribe only); others get 403.
   *   - TEAM    : same as SQUAD but membership is "operator is in any squad
   *               of this team".
   *   - COMMAND : ADMIN/INSTRUCTOR only, full publish+subscribe.
   *
   * Pre-conditions for any channel: the underlying event must be ACTIVE.
   * For SQUAD also the squad itself must be ACTIVE. (Same posture as MQTT
   * credentials in 1.8 — we don't hand out voice keys to ended runs.)
   */
  async issueToken(userId: string, dto: IssueVoiceTokenDto): Promise<VoiceTokenView> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    const isStaff = user.role === Role.ADMIN || user.role === Role.INSTRUCTOR;

    const decision = await this.resolveAccess(user, isStaff, dto);

    const ttlSeconds = this.env.VOICE_TOKEN_TTL_SECONDS;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const room = this.roomNameFor(dto);

    if (this.env.VOICE_MODE === 'stub') {
      return this.stubToken(decision, room, expiresAt);
    }

    return this.liveKitToken(decision, room, expiresAt, ttlSeconds);
  }

  // ─── Permission resolution ────────────────────────────────────────────

  private async resolveAccess(
    user: { id: string; displayName: string },
    isStaff: boolean,
    dto: IssueVoiceTokenDto,
  ): Promise<AccessDecision> {
    switch (dto.channel) {
      case 'SQUAD':
        return this.resolveSquad(user, isStaff, dto.channelId);
      case 'TEAM':
        return this.resolveTeam(user, isStaff, dto.channelId);
      case 'COMMAND':
        return this.resolveCommand(user, isStaff, dto.channelId);
    }
  }

  private async resolveSquad(
    user: { id: string; displayName: string },
    isStaff: boolean,
    squadId: string,
  ): Promise<AccessDecision> {
    const squad = await this.prisma.squad.findUnique({
      where: { id: squadId },
      include: { team: { include: { event: true } } },
    });
    if (!squad) {
      throw new NotFoundException('Squad not found.');
    }
    if (squad.status !== SquadStatus.ACTIVE) {
      throw new ConflictException(
        `Squad is in status ${squad.status}; only ACTIVE squads accept voice.`,
      );
    }
    if (squad.team.event.status !== EventStatus.ACTIVE) {
      throw new ConflictException(
        `Event is in status ${squad.team.event.status}; only ACTIVE events accept voice.`,
      );
    }

    const operator = await this.prisma.operator.findUnique({ where: { userId: user.id } });
    if (operator) {
      const membership = await this.prisma.squadMember.findUnique({
        where: { squadId_operatorId: { squadId, operatorId: operator.id } },
      });
      if (membership) {
        return { identity: `operator:${operator.callsign}`, canPublish: true, canSubscribe: true };
      }
    }

    if (isStaff) {
      return { identity: `staff:${user.displayName}`, canPublish: false, canSubscribe: true };
    }

    throw new ForbiddenException('You are not a member of this squad.');
  }

  private async resolveTeam(
    user: { id: string; displayName: string },
    isStaff: boolean,
    teamId: string,
  ): Promise<AccessDecision> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: { event: true },
    });
    if (!team) {
      throw new NotFoundException('Team not found.');
    }
    if (team.event.status !== EventStatus.ACTIVE) {
      throw new ConflictException(
        `Event is in status ${team.event.status}; only ACTIVE events accept voice.`,
      );
    }

    const operator = await this.prisma.operator.findUnique({ where: { userId: user.id } });
    if (operator) {
      const inTeam = await this.prisma.squadMember.findFirst({
        where: { operatorId: operator.id, squad: { teamId } },
      });
      if (inTeam) {
        return { identity: `operator:${operator.callsign}`, canPublish: true, canSubscribe: true };
      }
    }

    if (isStaff) {
      return { identity: `staff:${user.displayName}`, canPublish: false, canSubscribe: true };
    }

    throw new ForbiddenException('You are not a member of any squad in this team.');
  }

  private async resolveCommand(
    user: { id: string; displayName: string },
    isStaff: boolean,
    eventId: string,
  ): Promise<AccessDecision> {
    if (!isStaff) {
      throw new ForbiddenException('Command channel is restricted to ADMIN and INSTRUCTOR.');
    }
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Event not found.');
    }
    if (event.status !== EventStatus.ACTIVE) {
      throw new ConflictException(
        `Event is in status ${event.status}; only ACTIVE events accept voice.`,
      );
    }
    return { identity: `staff:${user.displayName}`, canPublish: true, canSubscribe: true };
  }

  // ─── Token minting (stub) ─────────────────────────────────────────────

  private stubToken(decision: AccessDecision, room: string, expiresAt: Date): VoiceTokenView {
    const expSeconds = Math.floor(expiresAt.getTime() / 1000);
    // Header + payload follow JWT shape so the mobile client only swaps the
    // signer when VOICE_MODE goes to `livekit`. Signature is a stable
    // sha256-derived opaque hex string (mobile must treat it as opaque).
    const header = base64Url(JSON.stringify({ alg: 'HS256-STUB', typ: 'JWT' }));
    const payload = base64Url(
      JSON.stringify({
        sub: decision.identity,
        room,
        exp: expSeconds,
        video: {
          roomJoin: true,
          room,
          canPublish: decision.canPublish,
          canSubscribe: decision.canSubscribe,
        },
      }),
    );
    const signature = createHash('sha256')
      .update(`${header}.${payload}:${decision.identity}:stub`)
      .digest('hex');

    return {
      url: this.env.LIVEKIT_URL ?? 'wss://livekit.stub.local',
      token: `${header}.${payload}.${signature}`,
      identity: decision.identity,
      room,
      canPublish: decision.canPublish,
      canSubscribe: decision.canSubscribe,
      expiresAt: expiresAt.toISOString(),
      mode: 'stub',
    };
  }

  private async liveKitToken(
    decision: AccessDecision,
    room: string,
    expiresAt: Date,
    ttlSeconds: number,
  ): Promise<VoiceTokenView> {
    if (!this.env.LIVEKIT_URL || !this.env.LIVEKIT_API_KEY || !this.env.LIVEKIT_API_SECRET) {
      throw new ServiceUnavailableException(
        'LiveKit is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET.',
      );
    }

    const token = new AccessToken(this.env.LIVEKIT_API_KEY, this.env.LIVEKIT_API_SECRET, {
      identity: decision.identity,
      name: decision.identity,
      ttl: ttlSeconds,
    });
    token.addGrant({
      roomJoin: true,
      room,
      canPublish: decision.canPublish,
      canSubscribe: decision.canSubscribe,
    });

    return {
      url: this.env.LIVEKIT_URL,
      token: await token.toJwt(),
      identity: decision.identity,
      room,
      canPublish: decision.canPublish,
      canSubscribe: decision.canSubscribe,
      expiresAt: expiresAt.toISOString(),
      mode: 'livekit',
    };
  }

  private roomNameFor(dto: IssueVoiceTokenDto): string {
    switch (dto.channel) {
      case 'SQUAD':
        return `squad:${dto.channelId}`;
      case 'TEAM':
        return `team:${dto.channelId}`;
      case 'COMMAND':
        return `command:${dto.channelId}`;
    }
  }
}

function base64Url(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}
