import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { ProviderError } from './provider-error';
import { createG6Auth } from '../../catalog/g6-auth';
import type { CatalogEnvironment, CatalogFetch } from '../../catalog/types';
import type { QuoteLine } from '../checkout.types';

export const CHECKOUT_G6_PIN = {
  version: '0.7.0-rc.3',
  commit: '40524e96c6973f84d74160076781702fe2a3da19',
  gitBlob: 'e094988f0f0d92a7a4241c1dc30a5e50d9ff709a',
} as const;

export const CHECKOUT_G6_SCOPES = ['precios:leer', 'inventario:disponibilidad:leer'] as const;

export interface G6CheckoutPrice {
  amount: number;
  currency: 'PEN';
  version: number;
}

export interface G6CheckoutRevalidation {
  available: boolean;
  revalidatedAt: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function unavailable(code: string, status = 503): ProviderError {
  return new ProviderError(status, code);
}

/** Read-only G6 commerce calls for checkout. These calls never reserve inventory. */
@Injectable()
export class G6CheckoutProvider {
  private auth?: ReturnType<typeof createG6Auth>;

  constructor(private readonly config: ConfigService) {}

  private environment(): CatalogEnvironment {
    const keys = ['NODE_ENV', 'PRODUCTOS_SERVICE_TOKEN', 'G7_TOKEN_URL', 'PRODUCTOS_CLIENT_SECRET'] as const;
    return Object.fromEntries([
      ['PRODUCTOS_AUTH_MODE', this.config.get<string>('WISHLIST_COMMERCE_AUTH_MODE', 'client-credentials')],
      ...keys.map((key) => [key, this.config.get<string>(key)]),
    ]);
  }

  private assertEnabled(operation: 'price' | 'inventory'): URL {
    if (this.config.get<string>('CHECKOUT_G6_SOURCE', 'mock') !== 'real' ||
        this.config.get<string>('CHECKOUT_G6_INTEGRATION_APPROVED', 'false') !== 'true' ||
        this.config.get<string>('CHECKOUT_G6_CONTRACT_VERSION') !== CHECKOUT_G6_PIN.version ||
        this.config.get<string>('CHECKOUT_G6_CONTRACT_BLOB') !== CHECKOUT_G6_PIN.gitBlob ||
        this.config.get<string>(operation === 'price' ? 'CHECKOUT_G6_PRICE_APPROVED' : 'CHECKOUT_G6_QUANTITY_APPROVED', 'false') !== 'true' ||
        this.config.get<boolean>('USE_MOCKS', false)) {
      throw unavailable('G6_CHECKOUT_INTEGRATION_DISABLED');
    }
    const timeout = Number(this.config.get<string>('PRODUCTOS_TIMEOUT_MS', '3000'));
    if (!Number.isInteger(timeout) || timeout < 100 || timeout > 5000) {
      throw unavailable('G6_CHECKOUT_CONFIGURATION_INVALID');
    }
    try {
      const base = new URL(this.config.get<string>('PRODUCTOS_BASE_URL', ''));
      const localHttp = this.config.get<string>('NODE_ENV') !== 'production' && base.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(base.hostname);
      if ((base.protocol !== 'https:' && !localHttp) || base.username || base.password || base.pathname !== '/' ||
          base.search || base.hash) throw new Error('invalid');
      return base;
    } catch {
      throw unavailable('G6_CHECKOUT_CONFIGURATION_INVALID');
    }
  }

  private async request(path: string, operation: 'price' | 'inventory', body?: unknown): Promise<unknown> {
    const base = this.assertEnabled(operation);
    const timeout = Number(this.config.get<string>('PRODUCTOS_TIMEOUT_MS', '3000'));
    this.auth ??= createG6Auth(this.environment(), fetch as CatalogFetch, timeout, CHECKOUT_G6_SCOPES);
    const authorization = await this.auth.getAuthorization();
    if (!authorization) throw unavailable('G6_CHECKOUT_AUTH_UNAVAILABLE');
    const method = body === undefined ? 'GET' : 'POST';
    const url = new URL(`/api/v1${path}`, base);
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: authorization,
          'X-Correlation-Id': randomUUID(),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error',
        cache: 'no-store',
        credentials: 'omit',
        signal: AbortSignal.timeout(timeout),
      });
    } catch (error: unknown) {
      const name = isRecord(error) && typeof error.name === 'string' ? error.name : '';
      throw unavailable(name === 'TimeoutError' || name === 'AbortError' ? 'G6_CHECKOUT_TIMEOUT' : 'G6_CHECKOUT_UNAVAILABLE',
        name === 'TimeoutError' || name === 'AbortError' ? 504 : 503);
    }
    if (!response.ok) {
      if (operation === 'price' && response.status === 404) throw unavailable('G6_PRICE_NOT_AVAILABLE', 409);
      if (response.status === 429) throw unavailable('G6_CHECKOUT_RATE_LIMITED', 503);
      throw unavailable(operation === 'price' ? 'G6_PRICE_UNAVAILABLE' : 'G6_INVENTORY_UNAVAILABLE', 503);
    }
    try {
      return await response.json();
    } catch {
      throw unavailable('G6_CHECKOUT_INVALID_RESPONSE', 502);
    }
  }

  async getPrice(sku: string): Promise<G6CheckoutPrice> {
    if (!text(sku) || sku.length > 256 || /[\u0000-\u001f\u007f]/u.test(sku)) {
      throw unavailable('G6_CHECKOUT_INVALID_REQUEST', 400);
    }
    const payload = await this.request(`/precios/skus/${encodeURIComponent(sku)}?canal=MARKETPLACE`, 'price');
    if (!isRecord(payload) || payload.sku !== sku || payload.currency !== 'PEN' ||
        !finite(payload.precio_regular) || payload.precio_regular <= 0 ||
        (payload.precio_oferta != null && (!finite(payload.precio_oferta) || payload.precio_oferta <= 0 ||
          payload.precio_oferta > payload.precio_regular)) ||
        !Number.isSafeInteger(payload.price_version) || (payload.price_version as number) < 0 ||
        !(payload.channel_id === null || payload.channel_id === 'MARKETPLACE') || !text(payload.vigencia_id) ||
        !(payload.origen === 'PRODUCTO' || payload.origen === 'SKU_OVERRIDE') || !text(payload.valid_from) ||
        !Number.isFinite(Date.parse(payload.valid_from)) ||
        (payload.valid_until != null && (!text(payload.valid_until) || !Number.isFinite(Date.parse(payload.valid_until))))) {
      throw unavailable('G6_PRICE_INVALID_RESPONSE', 502);
    }
    const now = Date.now();
    if (Date.parse(payload.valid_from) > now) throw unavailable('G6_PRICE_NOT_YET_VALID', 409);
    if (payload.valid_until != null && Date.parse(payload.valid_until as string) <= now) {
      throw unavailable('G6_PRICE_EXPIRED', 409);
    }
    return {
      amount: payload.precio_oferta ?? payload.precio_regular,
      currency: 'PEN',
      version: payload.price_version as number,
    };
  }

  async verifyQuantities(lines: QuoteLine[]): Promise<G6CheckoutRevalidation> {
    if (!Array.isArray(lines) || lines.length < 1 || lines.length > 100 ||
        lines.some((line) => !text(line.sku) || !Number.isSafeInteger(line.quantity) || line.quantity < 1) ||
        new Set(lines.map((line) => line.sku)).size !== lines.length) {
      throw unavailable('G6_CHECKOUT_INVALID_REQUEST', 400);
    }
    const payload = await this.request('/inventario/disponibilidad/comercial/verificar', 'inventory', {
      channel_id: 'MARKETPLACE',
      fulfillment: { mode: 'ENVIO_DOMICILIO' },
      lines: lines.map(({ sku, quantity }) => ({ sku, quantity })),
    });
    if (!isRecord(payload) || payload.binding !== false || !text(payload.evaluated_at) ||
        !Number.isFinite(Date.parse(payload.evaluated_at)) || !Array.isArray(payload.items) ||
        payload.items.length !== lines.length) {
      throw unavailable('G6_INVENTORY_INVALID_RESPONSE', 502);
    }
    const results = new Map<string, Record<string, unknown>>();
    for (const item of payload.items) {
      if (!isRecord(item) || !text(item.sku) || results.has(item.sku)) {
        throw unavailable('G6_INVENTORY_INVALID_RESPONSE', 502);
      }
      results.set(item.sku, item);
    }
    let available = true;
    for (const line of lines) {
      const item = results.get(line.sku);
      if (!item || item.requested_quantity !== line.quantity ||
          !['SUFICIENTE', 'INSUFICIENTE', 'INDETERMINADO'].includes(String(item.result))) {
        throw unavailable('G6_INVENTORY_INVALID_RESPONSE', 502);
      }
      if (item.result === 'INDETERMINADO') throw unavailable('G6_INVENTORY_UNDETERMINED', 503);
      if (item.result === 'INSUFICIENTE') available = false;
    }
    return { available, revalidatedAt: payload.evaluated_at };
  }
}
