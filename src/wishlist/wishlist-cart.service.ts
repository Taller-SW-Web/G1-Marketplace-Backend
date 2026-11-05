import { HttpException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CartService, CartSnapshotDto } from '../cart/cart.service';
import { WishlistCatalog } from '../catalog/wishlist-catalog';
import { ApiError } from '../http/api-error';
import { PrismaService } from '../prisma/prisma.service';

export interface AddFromWishlistResult { productId: string; cart: CartSnapshotDto & { cartId: string } }

@Injectable()
export class WishlistCartService {
  constructor(private readonly prisma: PrismaService, private readonly cart: CartService,
    private readonly catalog: WishlistCatalog) {}

  async add(customerId: string, productId: string): Promise<AddFromWishlistResult> {
    try {
      const favorite = await this.prisma.wishlistItem.findUnique({
        where: { customerId_productId: { customerId, productId } }, select: { id: true },
      });
      if (!favorite) throw new ApiError(409, 'CART_CONFLICT', 'El favorito ya no está disponible');

      // Finish provider calls before opening a PostgreSQL transaction or acquiring the owner lock.
      const sku = await this.catalog.resolveSku(productId);
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const expectedTotalQuantity = await this.cart.getActiveItemQuantity({ customerId, sku }) + 1;
        const commercial = await this.catalog.quote(sku, expectedTotalQuantity);
        try {
          return await this.prisma.$transaction(async (tx) => {
            // Same owner lock as ordinary cart additions, before reading any cart or favorite.
            await tx.$executeRaw`SET LOCAL lock_timeout = '1500ms'`;
            await this.cart.lockOwner(tx, { customerId });
            const favorites = await tx.$queryRaw<Array<{ id: string }>>`
              SELECT id FROM wishlist_items WHERE customer_id = ${customerId}::uuid AND product_id = ${productId} FOR SHARE`;
            if (!favorites.length) throw new ApiError(409, 'CART_CONFLICT', 'El favorito ya no está disponible');
            const addition = await this.cart.addItemInTransaction(tx, { customerId, sku, quantity: 1 },
              async () => commercial, expectedTotalQuantity);
            if (!addition.data.cartId) throw new Error('Missing committed cart');
            return { productId, cart: { ...addition.data, cartId: addition.data.cartId } };
          }, { maxWait: 2000, timeout: 5000 });
        } catch (error) {
          const response = error instanceof HttpException ? error.getResponse() as { code?: string } : undefined;
          if (response?.code === 'CART_CHANGED_RETRY' && attempt === 0) continue;
          throw error;
        }
      }
      throw new ApiError(409, 'CART_CHANGED_RETRY', 'El carrito cambió; vuelve a intentarlo');
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof HttpException) {
        const response = error.getResponse() as { code?: string };
        if (response.code === 'STOCK_LIMIT_REACHED') throw new ApiError(409, response.code, 'Existencias insuficientes');
        if (response.code === 'COMMERCE_DATA_UNAVAILABLE') throw new ApiError(503, response.code, 'Condiciones comerciales no disponibles');
        if (response.code === 'CART_CHANGED_RETRY') throw new ApiError(409, response.code, 'El carrito cambió; vuelve a intentarlo');
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError
        && (['P2028', 'P2034'].includes(error.code) || (error.code === 'P2010' && error.meta?.code === '55P03'))) {
        throw new ApiError(409, 'CART_CONFLICT', 'El carrito está ocupado');
      }
      throw error;
    }
  }
}
