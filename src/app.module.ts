import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CheckoutModule } from './checkout/checkout.module';
import { HealthModule } from './health/health.module';
import { OrdersModule } from './orders/orders.module';
import { PrismaModule } from './prisma/prisma.module';
import { validateEnvironment as validateH3Environment } from './config/environment';
import { AuthModule } from './auth/auth.module';
import { CartModule } from './cart/cart.module';
import { CatalogModule } from './catalog/catalog.module';
import { ProductCommerceModule } from './catalog/product-commerce.module';
import { ProductDetailModule } from './catalog/product-detail.module';
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
    AuthModule,
    OrdersModule,
    CartModule,
    CatalogModule,
    ProductDetailModule,
    ProductCommerceModule,
    CheckoutModule,
  ],
})
export class AppModule {}
