import {
  ConflictException,
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { EventStatus, SquadStatus } from '@prisma/client';
import { createHash } from 'node:crypto';

import { loadEnv } from '../../config/env';
import { PrismaService } from '../../shared/database/prisma.service';
import type { MqttCredentialsView } from './dto/mqtt.dto';

@Injectable()
export class MqttService {
  private readonly env = loadEnv();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Issues short-lived MQTT credentials for the operator linked to `userId`.
   *
   * Pre-conditions (each rejected with a specific 4xx so the mobile UI can
   * tell the user what to fix):
   *   1. The user has an Operator profile.
   *   2. The operator is a member of an ACTIVE squad.
   *   3. That squad's team belongs to an ACTIVE event.
   *
   * Mode `stub`: returns a fake but structurally identical URL — useful for
   * mobile dev without an AWS account.
   * Mode `aws`: throws NotImplementedException until the deploy session
   * wires STS:AssumeRole + SigV4-signed WSS URL.
   */
  async issueForUser(userId: string): Promise<MqttCredentialsView> {
    const operator = await this.prisma.operator.findUnique({ where: { userId } });
    if (!operator) {
      throw new NotFoundException(
        'No operator profile for this user — create one before requesting MQTT credentials.',
      );
    }

    const membership = await this.prisma.squadMember.findFirst({
      where: { operatorId: operator.id },
      include: {
        squad: {
          include: { team: { include: { event: true } } },
        },
      },
    });

    if (!membership) {
      throw new ConflictException('Operator has no squad membership.');
    }
    if (membership.squad.status !== SquadStatus.ACTIVE) {
      throw new ConflictException(
        `Squad is in status ${membership.squad.status}; only ACTIVE squads can publish positions.`,
      );
    }
    if (membership.squad.team.event.status !== EventStatus.ACTIVE) {
      throw new ConflictException(
        `Event is in status ${membership.squad.team.event.status}; only ACTIVE events accept MQTT traffic.`,
      );
    }

    const ttlSeconds = this.env.MQTT_CREDENTIAL_TTL_SECONDS;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const eventId = membership.squad.team.event.id;
    const topicPrefix = `oryx/positions/${eventId}/${operator.id}`;

    if (this.env.MQTT_MODE === 'stub') {
      return this.stubCredentials(operator.id, topicPrefix, expiresAt);
    }

    // ─── AWS mode (sessão de deploy) ───────────────────────────────────────
    // TODO(deploy): call STS:AssumeRole with a session policy scoped to
    // arn:aws:iot:${region}:${account}:client/${operator.id} and
    // arn:aws:iot:${region}:${account}:topic/${topicPrefix}, then build a
    // SigV4-signed wss URL pointing at AWS_IOT_ENDPOINT. Requires
    // @aws-sdk/client-sts + @aws-sdk/signature-v4 (intentionally NOT a
    // dependency yet — sessão 1.8 ships only the stub).
    throw new NotImplementedException(
      'MQTT_MODE=aws is not implemented yet. Switch to MQTT_MODE=stub for local dev.',
    );
  }

  private stubCredentials(
    operatorId: string,
    topicPrefix: string,
    expiresAt: Date,
  ): MqttCredentialsView {
    const expSeconds = Math.floor(expiresAt.getTime() / 1000);
    // Deterministic but opaque "signature" so requests look like the AWS
    // shape; mobile clients should treat it as opaque anyway.
    const signature = createHash('sha256').update(`${operatorId}:${expSeconds}`).digest('hex');
    const url =
      `wss://iot.stub.local/mqtt` +
      `?X-Amz-Algorithm=AWS4-HMAC-SHA256-STUB` +
      `&X-Amz-Expires=${this.env.MQTT_CREDENTIAL_TTL_SECONDS}` +
      `&X-Amz-Signature=${signature}` +
      `&clientId=${operatorId}`;

    return {
      url,
      clientId: operatorId,
      topicPrefix,
      expiresAt: expiresAt.toISOString(),
      mode: 'stub',
    };
  }
}
