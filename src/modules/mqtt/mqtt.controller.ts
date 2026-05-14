import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/dto/auth.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { MqttCredentialsView } from './dto/mqtt.dto';
import { MqttService } from './mqtt.service';

@Controller('mqtt')
@UseGuards(JwtAuthGuard)
export class MqttController {
  constructor(private readonly mqtt: MqttService) {}

  /**
   * Any authenticated user can mint credentials, but the service rejects
   * unless they have an operator profile in an ACTIVE squad/event. The
   * minted credentials only let the caller publish to their own topic
   * prefix (CLAUDE.md §3.7 — privilege scoping).
   */
  @Post('credentials')
  @HttpCode(HttpStatus.OK)
  async issue(@CurrentUser() user: AuthenticatedUser): Promise<MqttCredentialsView> {
    return this.mqtt.issueForUser(user.id);
  }
}
