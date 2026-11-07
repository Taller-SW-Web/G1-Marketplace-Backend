import { Injectable } from '@nestjs/common';
import { mapInBatches } from '../http/map-in-batches';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../http/api-error';
import { CommerceQuote, ProductProjection, WishlistCatalog } from './wishlist-catalog';
import { assertPublicCatalogRead } from './public-read-only';
import { createG6Auth } from './g6-auth';
import type { CatalogEnvironment } from './types';

// Immutable official G6 contract accepted for Wishlist/Cart commerce on 2026-11-05.
export const WISHLIST_G6_VERSION = '0.6.0-rc.3';
export const WISHLIST_G6_REVISION = 'a7778ec1a22811c1213a94ef096ab905911342cc';
export const WISHLIST_COMMERCE_SCOPES = ['precios:leer', 'inventario:disponibilidad:leer'] as const;
const unavailable = () => new ApiError(503, 'CATALOG_UNAVAILABLE', 'Catálogo no disponible');
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const skuIdentity = (v: unknown): v is string => text(v) && v.length <= 100
  && v !== '.' && v !== '..' && !/[\u0000-\u001f\u007f]/u.test(v);
const retired = (): ProductProjection => ({ name: null, slug: null, brand: null, image: null, price: null, availability: 'UNAVAILABLE' });
interface Product { name: string; slug: string; brand: string; hasVariants: boolean; skus: string[]; images: string[] }

@Injectable()
export class RealWishlistCatalog extends WishlistCatalog {
  private commerceAuth?: ReturnType<typeof createG6Auth>;
  constructor(private readonly config: ConfigService) { super(); }

  private environment(authMode: string): CatalogEnvironment {
    const keys = ['NODE_ENV', 'PRODUCTOS_SERVICE_TOKEN', 'G7_TOKEN_URL', 'PRODUCTOS_CLIENT_SECRET'] as const;
    return Object.fromEntries([
      ['PRODUCTOS_AUTH_MODE', authMode],
      ...keys.map(key => [key, this.config.get<string>(key)]),
    ]);
  }

  private async request(path: string, body?: unknown, commerce = false): Promise<unknown> {
    try {
      if (this.config.get('WISHLIST_G6_APPROVED') !== 'true'
        || this.config.get('WISHLIST_G6_VERSION') !== WISHLIST_G6_VERSION
        || this.config.get('WISHLIST_G6_REVISION') !== WISHLIST_G6_REVISION) throw unavailable();
      const base = new URL(this.config.get<string>('PRODUCTOS_BASE_URL', ''));
      const catalogAuthMode = this.config.get<string>('PRODUCTOS_AUTH_MODE', 'service-token');
      const commerceAuthMode = this.config.get<string>('WISHLIST_COMMERCE_AUTH_MODE', 'service-token');
      const timeout = Number(this.config.get('PRODUCTOS_TIMEOUT_MS', 3000));
      if (base.username || base.password || base.search || base.hash || base.pathname !== '/'
        || (base.protocol !== 'https:' && !(this.config.get('NODE_ENV') !== 'production'
          && base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname)))
        || !['service-token', 'public-read-only'].includes(catalogAuthMode)
        || !['service-token', 'client-credentials'].includes(commerceAuthMode)
        || !Number.isInteger(timeout) || timeout < 100 || timeout > 5000) throw unavailable();
      const method = body === undefined ? 'GET' : 'POST';
      const upstreamPath = `/api/v1${path}`;
      if (!commerce && catalogAuthMode === 'public-read-only') assertPublicCatalogRead(method, upstreamPath);
      if (commerce) {
        const allowed = (method === 'GET' && (path.startsWith('/precios/skus/')
          || path.startsWith('/inventario/disponibilidad/comercial?')))
          || (method === 'POST' && path === '/inventario/disponibilidad/comercial/verificar');
        if (!allowed) throw unavailable();
      }
      const headers: Record<string, string> = {
        Accept: 'application/json', 'X-Correlation-Id': randomUUID(),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      };
      if (commerce) {
        this.commerceAuth ??= createG6Auth(this.environment(commerceAuthMode),
          (url, options) => fetch(url, options), timeout, WISHLIST_COMMERCE_SCOPES);
        const authorization = await this.commerceAuth.getAuthorization();
        if (!authorization) throw unavailable();
        headers.Authorization = authorization;
      } else if (catalogAuthMode === 'service-token') {
        const token = this.config.get<string>('PRODUCTOS_SERVICE_TOKEN');
        if (!token || /\s/.test(token)) throw unavailable();
        headers.Authorization = `Bearer ${token}`;
      }
      const response = await fetch(new URL(`/api/v1${path}`, base), {
        method, redirect: 'error', cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(timeout),
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (response.status === 404 && body === undefined && path.startsWith('/productos/')) return null;
      if (!response.ok) throw unavailable();
      return await response.json();
    } catch { throw unavailable(); }
  }

  private async product(id: string): Promise<Product | null> {
    if (id === '.' || id === '..') throw unavailable();
    const value = await this.request(`/productos/${encodeURIComponent(id)}?canal=MARKETPLACE`);
    if (value === null) return null;
    if (!object(value) || value.product_id !== id || !text(value.name)
      || !text(value.slug) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug)
      || value.slug.length > 120 || typeof value.tiene_variantes !== 'boolean'
      || !object(value.marca) || !text(value.marca.name) || !Array.isArray(value.variants)
      || (value.status !== undefined && value.status !== 'ACTIVO')) throw unavailable();
    const skus: string[] = value.tiene_variantes ? value.variants.map((variant: unknown) => {
      if (!object(variant) || !skuIdentity(variant.sku)) throw unavailable();
      return variant.sku;
    }) : skuIdentity(value.sku_base) ? [value.sku_base] : [];
    if (!value.tiene_variantes && !skus.length) throw unavailable();
    if (new Set(skus).size !== skus.length) throw unavailable();
    if (value.images !== undefined && (!Array.isArray(value.images) || !value.images.every(text))) throw unavailable();
    return { name: value.name, slug: value.slug, brand: value.marca.name, hasVariants: value.tiene_variantes,
      skus, images: (value.images ?? []) as string[] };
  }

  async isActive(id: string): Promise<boolean> { return (await this.product(id)) !== null; }

  async resolveSku(id: string): Promise<string> {
    const product = await this.product(id);
    if (!product) throw new ApiError(404, 'PRODUCT_NOT_AVAILABLE', 'Producto no disponible');
    if (product.hasVariants) throw new ApiError(422, 'VARIANT_SELECTION_REQUIRED', 'Selecciona una variante', {
      redirectUrl: `/productos/${product.slug}`,
    });
    if (product.skus.length !== 1) throw unavailable();
    return product.skus[0];
  }

  private async price(sku: string): Promise<CommerceQuote> {
    if (!skuIdentity(sku)) throw unavailable();
    const price = await this.request(`/precios/skus/${encodeURIComponent(sku)}?canal=MARKETPLACE`, undefined, true);
    if (!object(price) || price.sku !== sku || price.currency !== 'PEN'
      || !finite(price.precio_regular) || price.precio_regular <= 0
      || (price.precio_oferta != null && (!finite(price.precio_oferta) || price.precio_oferta <= 0
        || price.precio_oferta > price.precio_regular))
      || !finite(price.price_version) || !Number.isSafeInteger(price.price_version) || price.price_version < 0
      || !(price.channel_id === null || price.channel_id === 'MARKETPLACE')
      || !text(price.vigencia_id) || !(price.origen === 'PRODUCTO' || price.origen === 'SKU_OVERRIDE')
      || !text(price.valid_from) || !Number.isFinite(Date.parse(price.valid_from)) || Date.parse(price.valid_from) > Date.now()
      || (price.valid_until != null && (!text(price.valid_until) || !Number.isFinite(Date.parse(price.valid_until))
        || Date.parse(price.valid_until) <= Date.now()))) throw unavailable();
    return { amount: price.precio_oferta ?? price.precio_regular, currency: 'PEN', version: price.price_version };
  }

  async project(id: string): Promise<ProductProjection> {
    const product = await this.product(id);
    if (!product) return retired();
    const skus = product.skus;
    if (!skus.length || skus.length > 100 || skus.some(sku => !text(sku) || sku.includes(','))) throw unavailable();
    const stock = await this.request(`/inventario/disponibilidad/comercial?${new URLSearchParams({ skus: skus.join(','), canal: 'MARKETPLACE' })}`, undefined, true);
    if (!object(stock) || !Array.isArray(stock.items) || stock.items.length !== skus.length) throw unavailable();
    const items = stock.items;
    if (skus.some(sku => items.filter((item: unknown) => object(item) && item.sku === sku
      && (item.status === 'DISPONIBLE' || item.status === 'STOCK_BAJO' || item.status === 'AGOTADO'
        || item.status === 'INDETERMINADO')).length !== 1)) throw unavailable();
    const prices = await mapInBatches(skus, sku => this.price(sku));
    let image: ProductProjection['image'] = null;
    if (product.images.length) {
      let url: URL;
      try { url = new URL(product.images[0]); } catch { throw unavailable(); }
      const hosts = String(this.config.get('PRODUCTOS_MEDIA_HOSTS', '')).split(',').map(host => host.trim());
      if (url.protocol !== 'https:' || url.username || url.password || !hosts.includes(url.hostname)) throw unavailable();
      image = { url: url.href, alt: product.name };
    }
    return { name: product.name, slug: product.slug, brand: product.brand, image,
      price: { amount: Math.min(...prices.map(price => price.amount)), currency: 'PEN' },
      availability: items.some((item: unknown) => object(item) && (item.status === 'DISPONIBLE' || item.status === 'STOCK_BAJO'))
        ? 'AVAILABLE'
        : items.some((item: unknown) => object(item) && item.status === 'INDETERMINADO')
          ? 'UNDETERMINED' : 'OUT_OF_STOCK' };
  }

  async quote(sku: string, quantity: number): Promise<CommerceQuote> {
    if (this.config.get('WISHLIST_G6_QUANTITY_APPROVED') !== 'true') throw unavailable();
    if (!skuIdentity(sku) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) throw unavailable();
    const result = await this.request('/inventario/disponibilidad/comercial/verificar', {
      channel_id: 'MARKETPLACE', fulfillment: { mode: 'ENVIO_DOMICILIO' },
      lines: [{ sku, quantity }],
    }, true);
    if (!object(result) || result.binding !== false || !text(result.evaluated_at) || !Number.isFinite(Date.parse(result.evaluated_at))
      || !Array.isArray(result.items) || result.items.length !== 1
      || !object(result.items[0]) || result.items[0].sku !== sku || result.items[0].requested_quantity !== quantity) throw unavailable();
    if (result.items[0].result === 'INSUFICIENTE') throw new ApiError(409, 'STOCK_LIMIT_REACHED', 'Existencias insuficientes');
    if (result.items[0].result === 'INDETERMINADO') {
      throw new ApiError(503, 'COMMERCE_DATA_UNAVAILABLE', 'Condiciones comerciales no disponibles');
    }
    if (result.items[0].result !== 'SUFICIENTE') throw unavailable();
    return this.price(sku);
  }
}
