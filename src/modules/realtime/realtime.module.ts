import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuthModule } from '../auth/auth.module';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeSubscriber } from './realtime.subscriber';

@Module({
  // JwtModule.register({}) — secrets are passed at verify time (same pattern
  // as AuthModule). AuthModule provides AuthService for user lookup.
  imports: [AuthModule, JwtModule.register({})],
  providers: [RealtimeGateway, RealtimeSubscriber],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
