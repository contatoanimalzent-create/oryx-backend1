import { Module } from '@nestjs/common';

import { AdminAntiCheatController } from './admin-anti-cheat.controller';
import { AdminMarketplaceController } from './admin-marketplace.controller';
import { AdminOperatorsController } from './admin-operators.controller';
import { AdminWalletController } from './admin-wallet.controller';
import { AdminService } from './admin.service';

@Module({
  controllers: [
    AdminOperatorsController,
    AdminWalletController,
    AdminAntiCheatController,
    AdminMarketplaceController,
  ],
  providers: [AdminService],
})
export class AdminModule {}
