import { Module } from '@nestjs/common';

import { WalletModule } from '../wallet/wallet.module';
import { BattlePassController } from './battle-pass.controller';
import { BattlePassService } from './battle-pass.service';

@Module({
  imports: [WalletModule],
  controllers: [BattlePassController],
  providers: [BattlePassService],
  exports: [BattlePassService],
})
export class BattlePassModule {}
