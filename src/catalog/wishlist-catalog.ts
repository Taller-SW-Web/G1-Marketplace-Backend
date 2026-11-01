import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiError } from '../http/api-error';

export interface ProductProjection {
  name: string | null;
  slug: string | null;
  brand: string | null;
  image: { url: string; alt: string } | null;
  price: { amount: number; currency: string } | null;
  availability: 'AVAILABLE' | 'OUT_OF_STOCK' | 'UNAVAILABLE';
}
export interface CommerceQuote {
  amount: number;
  currency: 'PEN';
  version: number;
}
export abstract class WishlistCatalog {
  abstract project(productId: string): Promise<ProductProjection>;
  abstract resolveSku(productId: string): Promise<string>;
  abstract quote(sku: string, totalQuantity: number): Promise<CommerceQuote>;
}

const fixtures: Record<string, { name: string; slug: string; sku?: string; stock: number }> = {
  'PRD-1': { name: 'Producto de prueba', slug: 'producto-de-prueba', sku: 'SKU-SIMPLE', stock: 10 },
  'PRD-VARIANT': { name: 'Producto con variantes', slug: 'producto-con-variantes', stock: 10 },
  'PRD-OUT-OF-STOCK': { name: 'Producto agotado', slug: 'producto-agotado', sku: 'SKU-OUT', stock: 0 },
  'PRD-COMMERCE-UNAVAILABLE': { name: 'Producto sin cotización', slug: 'producto-sin-cotizacion', sku: 'SKU-COMMERCE-UNAVAILABLE', stock: 10 },
};
export const SANDBOX_ACTIVE_PRODUCTS = Object.keys(fixtures);

@Injectable()
export class SandboxWishlistCatalog extends WishlistCatalog {
  constructor(private readonly config: ConfigService) { super(); }

  private assertEnabled(): void {
    if (!this.config.get<boolean>('H3_SANDBOX_ENABLED', false)
      || !['development', 'test'].includes(this.config.get<string>('NODE_ENV', process.env.NODE_ENV ?? 'development'))) {
      throw new ApiError(503, 'CATALOG_UNAVAILABLE', 'Catálogo no disponible');
    }
  }

  async project(productId: string): Promise<ProductProjection> {
    this.assertEnabled();
    if (productId === 'PRD-UNAVAILABLE') throw new ApiError(503, 'CATALOG_UNAVAILABLE', 'Catálogo no disponible');
    const fixture = Object.hasOwn(fixtures, productId) ? fixtures[productId] : undefined;
    if (!fixture) return { name: null, slug: null, brand: null, image: null, price: null, availability: 'UNAVAILABLE' };
    return { name: fixture.name, slug: fixture.slug, brand: 'Marca sandbox', image: null,
      price: { amount: 89.9, currency: 'PEN' }, availability: fixture.stock ? 'AVAILABLE' : 'OUT_OF_STOCK' };
  }

  async resolveSku(productId: string): Promise<string> {
    const projection = await this.project(productId);
    if (projection.availability === 'UNAVAILABLE') throw new ApiError(404, 'PRODUCT_NOT_AVAILABLE', 'Producto no disponible');
    const fixture = fixtures[productId];
    if (!fixture.sku) throw new ApiError(422, 'VARIANT_SELECTION_REQUIRED', 'Selecciona una variante', {
      redirectUrl: `/productos/${fixture.slug}`,
    });
    return fixture.sku;
  }

  async quote(sku: string, totalQuantity: number): Promise<CommerceQuote> {
    this.assertEnabled();
    const fixture = Object.values(fixtures).find((item) => item.sku === sku);
    if (!fixture || sku === 'SKU-COMMERCE-UNAVAILABLE') {
      throw new ApiError(503, 'COMMERCE_DATA_UNAVAILABLE', 'Condiciones comerciales no disponibles');
    }
    if (totalQuantity > fixture.stock) throw new ApiError(409, 'STOCK_LIMIT_REACHED', 'Existencias insuficientes');
    return { amount: 89.9, currency: 'PEN', version: 1 };
  }
}
