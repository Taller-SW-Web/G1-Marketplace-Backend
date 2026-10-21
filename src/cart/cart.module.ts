import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

import { AuthGuard } from '../security/auth.guard';
import { OptionalAuthGuard } from '../security/optional-auth.guard';
import { G7IntegrationModule } from '../auth/g7-integration.module';

@Module({
  imports: [PrismaModule, G7IntegrationModule],
  controllers: [CartController],
  providers: [CartService, AuthGuard, OptionalAuthGuard],
  exports: [CartService, AuthGuard],
})
export class CartModule {}
