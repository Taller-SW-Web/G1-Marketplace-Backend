import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { validateEnvironment as validateH3Environment } from './config/environment';
import { CartModule } from './cart/cart.module';
import { WishlistModule } from './wishlist/wishlist.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateH3Environment,
    }),
    PrismaModule,
    HealthModule,
    WishlistModule,
    CartModule,
  ],
})
export class AppModule {}
