import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export abstract class WishlistRepository {
  abstract save(customerId: string, productId: string): Promise<{ created: boolean }>;
  abstract remove(customerId: string, productId: string): Promise<void>;
}

@Injectable()
export class PrismaWishlistRepository extends WishlistRepository {
  constructor(private readonly prisma: PrismaService) { super(); }

  async save(customerId: string, productId: string): Promise<{ created: boolean }> {
    try {
      await this.prisma.wishlistItem.create({ data: { customerId, productId } });
      return { created: true };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const target = error.meta?.target;
      const expected = Array.isArray(target)
        ? target.length === 2 && target.includes('customer_id') && target.includes('product_id')
        : target === 'wishlist_items_customer_product_uk';
      if (!expected) throw error;
      // Read after the unique-conflict winner commits; never update its createdAt.
      const existing = await this.prisma.wishlistItem.findUnique({
        where: { customerId_productId: { customerId, productId } }, select: { id: true },
      });
      if (!existing) throw error;
      return { created: false };
    }
  }

  async remove(customerId: string, productId: string): Promise<void> {
    await this.prisma.wishlistItem.deleteMany({ where: { customerId, productId } });
  }
}
