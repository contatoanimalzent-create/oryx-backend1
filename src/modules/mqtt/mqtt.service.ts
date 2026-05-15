import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { EventStatus, SquadStatus } from '@prisma/client';
import { createHash } from 'node:crypto';

import { loadEnv } from '../../config/env';
import { PrismaService } from '../../shared/database/prisma.service';
import type { MqttCredentialsView } from './dto/mqtt.dto';

@Injectable()
export class MqttService {
  private readonly env = loadEnv();
  private readonly sts = new STSClient({ region: this.env.AWS_REGION });

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
   * Mode `aws`: returns a scoped STS AssumeRole session for AWS IoT Core.
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

    return this.awsCredentials(operator.id, topicPrefix, expiresAt, ttlSeconds);
  }

  private async awsCredentials(
    operatorId: string,
    topicPrefix: string,
    expiresAt: Date,
    ttlSeconds: number,
  ): Promise<MqttCredentialsView> {
    if (!this.env.AWS_IOT_ENDPOINT || !this.env.AWS_IOT_ROLE_ARN) {
      throw new ServiceUnavailableException(
        'AWS IoT is not configured. Set AWS_IOT_ENDPOINT and AWS_IOT_ROLE_ARN.',
      );
    }

    const accountId = this.accountIdFromRoleArn(this.env.AWS_IOT_ROLE_ARN);
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: ['iot:Connect'],
          Resource: [`arn:aws:iot:${this.env.AWS_REGION}:${accountId}:client/${operatorId}`],
        },
        {
          Effect: 'Allow',
          Action: ['iot:Publish'],
          Resource: [`arn:aws:iot:${this.env.AWS_REGION}:${accountId}:topic/${topicPrefix}/*`],
        },
      ],
    };

    const response = await this.sts.send(
      new AssumeRoleCommand({
        RoleArn: this.env.AWS_IOT_ROLE_ARN,
        RoleSessionName: `oryx-${operatorId}`.slice(0, 64),
        DurationSeconds: ttlSeconds,
        Policy: JSON.stringify(policy),
      }),
    );

    const credentials = response.Credentials;
    if (!credentials?.AccessKeyId || !credentials.SecretAccessKey || !credentials.SessionToken) {
      throw new ServiceUnavailableException('AWS STS did not return complete IoT credentials.');
    }

    return {
      url: `wss://${this.env.AWS_IOT_ENDPOINT}/mqtt`,
      clientId: operatorId,
      topicPrefix,
      expiresAt: (credentials.Expiration ?? expiresAt).toISOString(),
      mode: 'aws',
      awsCredentials: {
        accessKeyId: credentials.AccessKeyId,
        secretAccessKey: credentials.SecretAccessKey,
        sessionToken: credentials.SessionToken,
        region: this.env.AWS_REGION,
      },
    };
  }

  private accountIdFromRoleArn(roleArn: string): string {
    const accountId = roleArn.split(':')[4];
    if (!accountId) {
      throw new ServiceUnavailableException('AWS_IOT_ROLE_ARN is not a valid role ARN.');
    }
    return accountId;
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
