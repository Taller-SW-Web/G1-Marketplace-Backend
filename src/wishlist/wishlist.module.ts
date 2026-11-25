import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RealWishlistCatalog } from '../catalog/real-wishlist-catalog';
import { ProductEligibilityPort, SandboxProductEligibility } from '../catalog/product-eligibility';
import { IdentityGuard, IdentityPort, SandboxIdentityAdapter } from '../identity/identity.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { WishlistController } from './wishlist.controller';
import { PrismaWishlistRepository, WishlistRepository } from './wishlist.repository';
import { WishlistService } from './wishlist.service';
import { CartModule } from '../cart/cart.module';
import { WishlistCatalog, SandboxWishlistCatalog } from '../catalog/wishlist-catalog';
import { WishlistReadService } from './wishlist-read.service';
import { WishlistCartService } from './wishlist-cart.service';

@Module({
  imports: [PrismaModule, CartModule], controllers: [WishlistController],
  providers: [WishlistService, IdentityGuard, WishlistReadService, WishlistCartService,
    SandboxWishlistCatalog, RealWishlistCatalog, SandboxProductEligibility,
    { provide: WishlistCatalog, inject: [ConfigService, SandboxWishlistCatalog, RealWishlistCatalog],
      useFactory: (config: ConfigService, sandbox: SandboxWishlistCatalog, real: RealWishlistCatalog) =>
        config.get('WISHLIST_SOURCE') === 'real' ? real : sandbox },
    { provide: IdentityPort, useClass: SandboxIdentityAdapter },
    { provide: ProductEligibilityPort, inject: [ConfigService, SandboxProductEligibility, RealWishlistCatalog],
      useFactory: (config: ConfigService, sandbox: SandboxProductEligibility, real: RealWishlistCatalog) =>
        config.get('WISHLIST_SOURCE') === 'real' ? real : sandbox },
    { provide: WishlistRepository, useClass: PrismaWishlistRepository },
  ],
})
export class WishlistModule {}
