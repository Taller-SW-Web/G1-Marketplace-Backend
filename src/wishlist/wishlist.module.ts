import { Module } from '@nestjs/common';
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
    { provide: WishlistCatalog, useClass: SandboxWishlistCatalog },
    { provide: IdentityPort, useClass: SandboxIdentityAdapter },
    { provide: ProductEligibilityPort, useClass: SandboxProductEligibility },
    { provide: WishlistRepository, useClass: PrismaWishlistRepository },
  ],
})
export class WishlistModule {}
