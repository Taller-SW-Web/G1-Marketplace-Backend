import { randomUUID } from 'node:crypto';
import { CatalogError } from './errors';
import { createMockProvider } from './fixtures';
import type { CatalogEnvironment, CatalogFetch, CatalogProvider, ProductCardDTO, Category } from './types';

export const CONTRACT_VERSION = '0.6.0-rc.1';
export const CONTRACT_SHA = 'f64bfe9a097b2a0f74c2600988305443d92f640e';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function validText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function invalidProvider(reason: string): CatalogError {
  return new CatalogError('CATALOG_UNAVAILABLE', 503, reason);
}

function categoriesFrom(payload: unknown): Category[] {
  if (!record(payload) || !Array.isArray(payload.categories)) throw invalidProvider('INVALID_CATEGORIES');
  const categories = payload.categories
    .filter((item: unknown): item is Record<string, unknown> => record(item) && item.status === 'ACTIVA')
    .map((item) => {
      if (!validText(item.categoria_id) || !validText(item.name)) throw invalidProvider('INVALID_CATEGORY');
      return { categoryId: item.categoria_id, name: item.name };
    });
  if (new Set(categories.map(item => item.categoryId)).size !== categories.length) throw invalidProvider('DUPLICATE_CATEGORY');
  return categories;
}

export function projectProduct(product: unknown, mediaHosts: Set<string>): ProductCardDTO {
  if (!record(product)) throw invalidProvider('INVALID_PRODUCT');
  const { product_id, name, categoria_id, marca_id, slug, images, status } = product;
  if (
    !validText(product_id) || !validText(name) || !validText(categoria_id) ||
    !validText(marca_id) || !validText(slug) ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 120
  ) throw invalidProvider('INVALID_PRODUCT');
  if (status && status !== 'ACTIVO') throw invalidProvider('INELIGIBLE_PRODUCT');

  // G6 permits omitted images or an empty array. Preserve the product and page totals.
  let image: ProductCardDTO['image'] = null;
  if (images !== undefined && !Array.isArray(images)) throw invalidProvider('INVALID_PRODUCT_IMAGE');
  if (Array.isArray(images) && images.length > 0) {
    if (!validText(images[0])) throw invalidProvider('INVALID_PRODUCT_IMAGE');
    let imageUrl: URL;
    try { imageUrl = new URL(images[0]); }
    catch { throw invalidProvider('INVALID_PRODUCT_IMAGE'); }
    if (imageUrl.protocol !== 'https:' || imageUrl.username || imageUrl.password || !mediaHosts.has(imageUrl.hostname)) {
      throw invalidProvider('UNAPPROVED_MEDIA_HOST');
    }
    image = { url: imageUrl.href, alt: name };
  }
  return {
    productId: product_id, slug, name, categoryId: categoria_id, brandId: marca_id,
    image,
  };
}

export function createRealProvider(env: CatalogEnvironment, fetchImpl: CatalogFetch = fetch): CatalogProvider {
  const timeoutMs = Number(env.PRODUCTOS_TIMEOUT_MS || 5000);
  const authMode = env.PRODUCTOS_AUTH_MODE ?? 'service-token';
  const mediaHosts = new Set((env.PRODUCTOS_MEDIA_HOSTS || '').split(',').map((value) => value.trim()).filter(Boolean));
  let base: URL;
  try { base = new URL(env.PRODUCTOS_BASE_URL || ''); }
  catch { throw invalidProvider('PROVIDER_CONFIG_MISSING'); }
  if (
    (base.protocol !== 'https:' && !(env.NODE_ENV !== 'production' && base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname))) ||
    base.username || base.password || base.search || base.hash || base.pathname !== '/' ||
    !['service-token', 'demo-no-auth'].includes(authMode) ||
    (authMode === 'service-token' && !env.PRODUCTOS_SERVICE_TOKEN) ||
    !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000 ||
    env.PRODUCTOS_CONTRACT_VERSION !== CONTRACT_VERSION || env.PRODUCTOS_CONTRACT_SHA !== CONTRACT_SHA ||
    env.CATALOG_INTEGRATION_APPROVED !== 'true'
  ) throw invalidProvider('PROVIDER_NOT_APPROVED');

  async function request(path: string, requestId?: string): Promise<unknown> {
    const url = new URL(`${base.href.replace(/\/$/, '')}${path}`);
    try {
      const headers: Record<string, string> = {
        Accept: 'application/json', 'X-Correlation-Id': requestId || randomUUID(),
      };
      // G6's temporary demo explicitly permits calls without JWT (PR #130).
      // Never forward a stale service token or a visitor's identity in that mode.
      if (authMode === 'service-token') headers.Authorization = `Bearer ${env.PRODUCTOS_SERVICE_TOKEN}`;
      const response = await fetchImpl(url, {
        headers,
        redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        if (response.status === 422) {
          const problem: unknown = await response.json();
          if (record(problem) && ['CATEGORIA_INVALIDA', 'MARCA_INVALIDA'].includes(String(problem.code)))
            throw new CatalogError('INVALID_FILTER', 400);
        }
        throw invalidProvider(`PROVIDER_HTTP_${response.status}`);
      }
      return await response.json();
    } catch (error: unknown) {
      if (error instanceof CatalogError) throw error;
      const name = record(error) && typeof error.name === 'string' ? error.name : '';
      throw invalidProvider(name === 'TimeoutError' || name === 'AbortError' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_INVALID_RESPONSE');
    }
  }

  return {
    source: 'REAL',
    async home(requestId) {
      const payload = await request('/api/v1/categorias', requestId);
      const categories = categoriesFrom(payload);
      return { categories, featuredProducts: [] };
    },
    async filters(requestId) {
      const [categoryPayload, payload] = await Promise.all([
        request('/api/v1/categorias', requestId), request('/api/v1/marcas', requestId),
      ]);
      const categories = categoriesFrom(categoryPayload);
      if (!record(payload) || !Array.isArray(payload.brands)) throw invalidProvider('INVALID_BRANDS');
      const brands = payload.brands
        .filter((item: unknown): item is Record<string, unknown> => record(item) && item.status === 'ACTIVA')
        .map(item => {
          if (!validText(item.marca_id) || !validText(item.name)) throw invalidProvider('INVALID_BRAND');
          return { brandId: item.marca_id, name: item.name };
        });
      if (new Set(brands.map(item => item.brandId)).size !== brands.length) throw invalidProvider('DUPLICATE_BRAND');
      return { categories, brands };
    },
    async search(query, requestId) {
      const params = new URLSearchParams({ canal: 'MARKETPLACE', pagina: String(query.page + 1), tamanio: String(query.pageSize) });
      if (query.q) params.set('q', query.q);
      if (query.categoryId) params.set('categoriaId', query.categoryId);
      if (query.brandId) params.set('marcaId', query.brandId);
      if (query.minPrice !== undefined) params.set('precioMin', String(query.minPrice));
      if (query.maxPrice !== undefined) params.set('precioMax', String(query.maxPrice));
      if (query.sort) params.set('orden', query.sort === 'NAME_ASC' ? 'NOMBRE_ASC' : 'NOMBRE_DESC');
      const payload = await request(`/api/v1/productos?${params}`, requestId);
      if (
        !record(payload) || !Array.isArray(payload.items) || typeof payload.total !== 'number' ||
        !Number.isSafeInteger(payload.total) || payload.total < 0 || payload.pagina !== query.page + 1 ||
        payload.tamanio !== query.pageSize || payload.items.length > query.pageSize || payload.items.length > payload.total ||
        payload.items.length !== Math.max(0, Math.min(query.pageSize, payload.total - query.page * query.pageSize)) ||
        new Set(payload.items.map((item: unknown) => record(item) ? item.product_id : undefined)).size !== payload.items.length
      ) throw invalidProvider('INVALID_PAGE_RESPONSE');
      return {
        data: payload.items.map((product: unknown) => projectProduct(product, mediaHosts)),
        page: { number: query.page, size: query.pageSize, totalElements: payload.total, totalPages: Math.ceil(payload.total / query.pageSize) },
      };
    },
  };
}

export function createProvider(env: CatalogEnvironment = process.env, fetchImpl?: CatalogFetch): CatalogProvider {
  if (env.CATALOG_SOURCE === 'mock') {
    if (env.NODE_ENV === 'production') throw new Error('CATALOG_SOURCE=mock is forbidden in production');
    return createMockProvider();
  }
  if (env.CATALOG_SOURCE === 'real') {
    try { return createRealProvider(env, fetchImpl); }
    catch (error: unknown) {
      return { source: 'UNCONFIGURED', home: async () => { throw error; }, search: async () => { throw error; } };
    }
  }
  return {
    source: 'UNCONFIGURED',
    home: async () => { throw invalidProvider('PROVIDER_CONFIG_MISSING'); },
    search: async () => { throw invalidProvider('PROVIDER_CONFIG_MISSING'); },
  };
}
