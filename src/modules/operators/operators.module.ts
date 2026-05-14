import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { OperatorsController } from './operators.controller';
import { OperatorsRepository } from './operators.repository';
import { OperatorsService } from './operators.service';

@Module({
  // AuthModule provides JwtStrategy + AuthService that JwtAuthGuard depends on.
  imports: [AuthModule],
  controllers: [OperatorsController],
  providers: [OperatorsService, OperatorsRepository],
  exports: [OperatorsService],
})
export class OperatorsModule {}
