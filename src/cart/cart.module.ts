import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

import { AuthGuard } from '../security/auth.guard';
import { OptionalAuthGuard } from '../security/optional-auth.guard';

@Module({
  imports: [PrismaModule],
  controllers: [CartController],
  providers: [CartService, AuthGuard, OptionalAuthGuard],
  exports: [CartService, AuthGuard],
})
export class CartModule {}
