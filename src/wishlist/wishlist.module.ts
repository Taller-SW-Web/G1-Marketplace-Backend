import { Module } from '@nestjs/common';
import { ProductEligibilityPort, SandboxProductEligibility } from '../catalog/product-eligibility';
import { IdentityGuard, IdentityPort, SandboxIdentityAdapter } from '../identity/identity.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { WishlistController } from './wishlist.controller';
import { PrismaWishlistRepository, WishlistRepository } from './wishlist.repository';
import { WishlistService } from './wishlist.service';

@Module({
  imports: [PrismaModule], controllers: [WishlistController],
  providers: [WishlistService, IdentityGuard,
    { provide: IdentityPort, useClass: SandboxIdentityAdapter },
    { provide: ProductEligibilityPort, useClass: SandboxProductEligibility },
    { provide: WishlistRepository, useClass: PrismaWishlistRepository },
  ],
})
export class WishlistModule {}
