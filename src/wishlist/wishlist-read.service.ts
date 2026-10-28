import { Injectable } from '@nestjs/common';
import { mapInBatches } from '../http/map-in-batches';
import { WishlistCatalog, ProductProjection } from '../catalog/wishlist-catalog';
import { ApiError } from '../http/api-error';
import { PrismaService } from '../prisma/prisma.service';

export type WishlistItemView = ProductProjection & { productId: string; createdAt: string };

@Injectable()
export class WishlistReadService {
  constructor(private readonly prisma: PrismaService, private readonly catalog: WishlistCatalog) {}

  async list(customerId: string): Promise<WishlistItemView[]> {
    const rows = await this.prisma.wishlistItem.findMany({ where: { customerId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { productId: true, createdAt: true } });
    return mapInBatches(rows, async (row) => {
      let projection: ProductProjection;
      try {
        projection = await this.catalog.project(row.productId);
        const validSlug = projection.slug === null || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(projection.slug);
        const nonempty = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
        if (!['AVAILABLE', 'OUT_OF_STOCK', 'UNAVAILABLE'].includes(projection.availability)
          || !validSlug || !(projection.name === null || nonempty(projection.name))
          || !(projection.brand === null || nonempty(projection.brand))
          || (projection.availability !== 'UNAVAILABLE' && (!nonempty(projection.name) || !projection.slug))
          || (projection.price !== null && (!Number.isFinite(projection.price.amount) || projection.price.amount < 0
            || !/^[A-Z]{3}$/.test(projection.price.currency)))
          || (projection.image !== null && (!nonempty(projection.image.alt)
            || !/^https:\/\//.test(projection.image.url)))) throw new Error('Invalid projection');
      } catch {
        throw new ApiError(503, 'CATALOG_UNAVAILABLE', 'Catálogo no disponible');
      }
      return { productId: row.productId, createdAt: row.createdAt.toISOString(),
        name: projection.name, slug: projection.slug, brand: projection.brand,
        image: projection.image, price: projection.price, availability: projection.availability };
    });
  }
}
