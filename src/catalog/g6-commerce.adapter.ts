import { randomUUID } from 'node:crypto';
import { BffCatalogException } from './bff-catalog.exception';
import { mapG6Availability } from './g6-availability.mapper';
import { mapG6Price } from './g6-price.mapper';
import type { ProductAvailabilityResponseDTO } from './product-availability.dto';
import type { ProductPriceResponseDTO } from './product-price.dto';
import { AVAILABILITY_ERROR_CODES } from './product-availability.errors';
import { PRICE_ERROR_CODES } from './product-price.errors';
import type { CatalogFetch, CatalogEnvironment } from './types';

export const G6_COMMERCE_PIN = {
  version: '0.7.0-rc.3',
  commit: '40524e96c6973f84d74160076781702fe2a3da19',
  gitBlob: 'e094988f0f0d92a7a4241c1dc30a5e50d9ff709a',
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type AuthorizationProvider = () => Promise<string | undefined>;

export type G6CommerceAdapter = {
  getPrice(input: { productId: string; sku: string; requestId?: string }): Promise<ProductPriceResponseDTO>;
  getAvailability(input: { productId: string; sku: string; requestId?: string }): Promise<ProductAvailabilityResponseDTO>;
};

function unavailable(kind: 'price' | 'availability', reason: string, timeout = false): BffCatalogException {
  if (kind === 'price') {
    return new BffCatalogException(
      timeout ? 504 : 503,
      timeout ? PRICE_ERROR_CODES.PRICING_TIMEOUT : PRICE_ERROR_CODES.PRICING_UNAVAILABLE,
      'No pudimos consultar el precio en este momento',
    );
  }
  return new BffCatalogException(
    timeout ? 504 : 503,
    timeout ? AVAILABILITY_ERROR_CODES.INVENTORY_TIMEOUT : AVAILABILITY_ERROR_CODES.INVENTORY_UNAVAILABLE,
    'No pudimos consultar la disponibilidad en este momento',
  );
}

function invalid(kind: 'price' | 'availability'): BffCatalogException {
  return kind === 'price'
    ? new BffCatalogException(502, PRICE_ERROR_CODES.PRICING_INVALID_RESPONSE, 'Respuesta de precios fuera de contrato')
    : new BffCatalogException(502, AVAILABILITY_ERROR_CODES.INVENTORY_INVALID_RESPONSE, 'Respuesta de inventario fuera de contrato');
}

/**
 * Prepares isolated G6 price/availability reads. The normal BFF services do not
 * call this adapter until the integration and each operation's grant are approved.
 */
export function createG6CommerceAdapter(
  env: CatalogEnvironment,
  authorizationProvider: AuthorizationProvider,
  fetchImpl: CatalogFetch = fetch,
): G6CommerceAdapter {
  const timeoutMs = Number(env.PRODUCTOS_TIMEOUT_MS || 5000);
  let base: URL;
  try {
    base = new URL(env.PRODUCTOS_BASE_URL || '');
  } catch {
    throw unavailable('price', 'PROVIDER_CONFIG_MISSING');
  }

  const localHttp = env.NODE_ENV !== 'production' && base.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if ((base.protocol !== 'https:' && !localHttp) || base.username || base.password ||
      base.search || base.hash || base.pathname !== '/' ||
      !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000 ||
      env.PRODUCTOS_COMMERCE_CONTRACT_VERSION !== G6_COMMERCE_PIN.version ||
      env.PRODUCTOS_COMMERCE_CONTRACT_BLOB !== G6_COMMERCE_PIN.gitBlob) {
    throw unavailable('price', 'PROVIDER_NOT_APPROVED');
  }

  async function request(path: string, kind: 'price' | 'availability', requestId?: string): Promise<unknown> {
    const gate = kind === 'price' ? 'PRODUCTOS_PRICE_INTEGRATION_APPROVED' : 'PRODUCTOS_AVAILABILITY_INTEGRATION_APPROVED';
    if (env.CATALOG_INTEGRATION_APPROVED !== 'true' || env[gate] !== 'true') {
      throw unavailable(kind, 'OPERATION_GRANT_PENDING');
    }

    const correlationId = requestId && UUID.test(requestId) ? requestId : randomUUID();
    const url = new URL(path, base);
    let response: Response;
    try {
      const authorization = await authorizationProvider();
      if (!authorization || !/^Bearer [\x21-\x7e]+$/u.test(authorization)) {
        throw unavailable(kind, 'PROVIDER_AUTH_NOT_CONFIGURED');
      }
      response = await fetchImpl(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: authorization,
          'X-Correlation-Id': correlationId,
        },
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error: unknown) {
      if (error instanceof BffCatalogException) throw error;
      const name = record(error) && typeof error.name === 'string' ? error.name : '';
      throw unavailable(kind, 'PROVIDER_UNAVAILABLE', name === 'TimeoutError' || name === 'AbortError');
    }

    if (!response.ok) {
      if (kind === 'price' && response.status === 404) {
        throw new BffCatalogException(422, PRICE_ERROR_CODES.PRICE_NOT_AVAILABLE, 'No hay un precio comercial vigente para este producto');
      }
      throw unavailable(kind, `PROVIDER_HTTP_${response.status}`);
    }
    try {
      return await response.json();
    } catch {
      throw invalid(kind);
    }
  }

  return {
    async getPrice({ productId, sku, requestId }) {
      const params = new URLSearchParams({ canal: 'MARKETPLACE' });
      const payload = await request(`/api/v1/precios/skus/${encodeURIComponent(sku)}?${params}`, 'price', requestId);
      try {
        return mapG6Price(payload, { productId, sku, retrievedAt: new Date().toISOString() });
      } catch (error: unknown) {
        if (error instanceof BffCatalogException) throw error;
        throw invalid('price');
      }
    },
    async getAvailability({ productId, sku, requestId }) {
      const params = new URLSearchParams({ skus: sku, canal: 'MARKETPLACE' });
      const payload = await request(`/api/v1/inventario/disponibilidad/comercial?${params}`, 'availability', requestId);
      try {
        return mapG6Availability(payload, { productId, sku, checkedAt: new Date().toISOString() });
      } catch (error: unknown) {
        if (error instanceof BffCatalogException) throw error;
        throw invalid('availability');
      }
    },
  };
}
