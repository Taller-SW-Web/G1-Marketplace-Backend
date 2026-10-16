import { randomUUID } from 'node:crypto';
import { CatalogError } from './errors';
import { createMockProvider } from './fixtures';
import type { CatalogEnvironment, CatalogFetch, CatalogProvider, ProductCardDTO } from './types';

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

export function projectProduct(product: unknown, mediaHosts: Set<string>): ProductCardDTO {
  if (!record(product)) throw invalidProvider('INVALID_PRODUCT');
  const { product_id, name, categoria_id, marca_id, slug, images, status } = product;
  if (
    !validText(product_id) || !validText(name) || !validText(categoria_id) ||
    !validText(marca_id) || !validText(slug) ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 120 ||
    !Array.isArray(images) || images.length === 0 || !validText(images[0])
  ) throw invalidProvider('INVALID_PRODUCT');
  if (status && status !== 'ACTIVO') throw invalidProvider('INELIGIBLE_PRODUCT');

  let imageUrl: URL;
  try { imageUrl = new URL(images[0]); }
  catch { throw invalidProvider('INVALID_PRODUCT_IMAGE'); }
  if (imageUrl.protocol !== 'https:' || imageUrl.username || imageUrl.password || !mediaHosts.has(imageUrl.hostname)) {
    throw invalidProvider('UNAPPROVED_MEDIA_HOST');
  }
  return {
    productId: product_id, slug, name, categoryId: categoria_id, brandId: marca_id,
    image: { url: imageUrl.href, alt: name },
  };
}

export function createRealProvider(env: CatalogEnvironment, fetchImpl: CatalogFetch = fetch): CatalogProvider {
  const timeoutMs = Number(env.PRODUCTOS_TIMEOUT_MS || 5000);
  const mediaHosts = new Set((env.PRODUCTOS_MEDIA_HOSTS || '').split(',').map((value) => value.trim()).filter(Boolean));
  let base: URL;
  try { base = new URL(env.PRODUCTOS_BASE_URL || ''); }
  catch { throw invalidProvider('PROVIDER_CONFIG_MISSING'); }
  if (
    (base.protocol !== 'https:' && !(env.NODE_ENV !== 'production' && base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname))) ||
    base.username || base.password || base.search || base.hash || base.pathname !== '/' ||
    !env.PRODUCTOS_SERVICE_TOKEN || !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000 ||
    env.PRODUCTOS_CONTRACT_VERSION !== CONTRACT_VERSION || env.PRODUCTOS_CONTRACT_SHA !== CONTRACT_SHA ||
    env.CATALOG_INTEGRATION_APPROVED !== 'true'
  ) throw invalidProvider('PROVIDER_NOT_APPROVED');

  async function request(path: string, requestId?: string): Promise<unknown> {
    const url = new URL(`${base.href.replace(/\/$/, '')}${path}`);
    try {
      const response = await fetchImpl(url, {
        headers: {
          Accept: 'application/json', Authorization: `Bearer ${env.PRODUCTOS_SERVICE_TOKEN}`,
          'X-Correlation-Id': requestId || randomUUID(),
        },
        redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw invalidProvider(`PROVIDER_HTTP_${response.status}`);
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
      if (!record(payload) || !Array.isArray(payload.categories)) throw invalidProvider('INVALID_CATEGORIES');
      const categories = payload.categories
        .filter((item: unknown): item is Record<string, unknown> => record(item) && item.status === 'ACTIVA')
        .map((item) => {
          if (!validText(item.categoria_id) || !validText(item.name)) throw invalidProvider('INVALID_CATEGORY');
          return { categoryId: item.categoria_id, name: item.name };
        });
      return { categories, featuredProducts: [] };
    },
    async search(query, requestId) {
      const params = new URLSearchParams({ canal: 'MARKETPLACE', pagina: String(query.page + 1), tamanio: String(query.pageSize) });
      if (query.q) params.set('q', query.q);
      if (query.categoryId) params.set('categoriaId', query.categoryId);
      if (query.sort) params.set('orden', query.sort === 'NAME_ASC' ? 'NOMBRE_ASC' : 'NOMBRE_DESC');
      const payload = await request(`/api/v1/productos?${params}`, requestId);
      if (
        !record(payload) || !Array.isArray(payload.items) || typeof payload.total !== 'number' ||
        !Number.isSafeInteger(payload.total) || payload.total < 0 || payload.pagina !== query.page + 1 ||
        payload.tamanio !== query.pageSize || payload.items.length > query.pageSize || payload.items.length > payload.total
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
