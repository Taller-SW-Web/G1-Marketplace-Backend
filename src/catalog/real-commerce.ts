/**
 * Cableado REAL de precio (F-012) y disponibilidad (F-014) contra G6.
 *
 * - El SKU se resuelve con las variantes REAL (`realProductVariants`); el detalle no lo expone.
 * - El token de G7 usa el flujo client-credentials ya existente (`createG6Auth`).
 * - Sigue fallando cerrado: el adaptador exige `CATALOG_INTEGRATION_APPROVED`,
 *   `PRODUCTOS_PRICE_INTEGRATION_APPROVED` / `PRODUCTOS_AVAILABILITY_INTEGRATION_APPROVED`
 *   y el pin del contrato `0.7.0-rc.3`. Con las variables apagadas responde 503 como antes.
 */

import { BffCatalogException } from './bff-catalog.exception';
import { createG6Auth } from './g6-auth';
import { createG6CommerceAdapter, type G6CommerceAdapter } from './g6-commerce.adapter';
import { realProductVariants } from './product-variants.real';
import type { CatalogEnvironment } from './types';

export type RealCommerceErrorKind =
  | 'INVALID_SLUG'
  | 'NOT_AVAILABLE'
  | 'SELECTION_REQUIRED'
  | 'SKU_MISMATCH'
  | 'TIMEOUT'
  | 'INVALID'
  | 'UNAVAILABLE';

/** Error neutro: cada servicio lo traduce a sus propios códigos de contrato. */
export class RealCommerceError extends Error {
  constructor(readonly kind: RealCommerceErrorKind) {
    super(kind);
    this.name = 'RealCommerceError';
  }
}

export type ResolvedSku = { productId: string; sku: string };

/** Scopes que el BFF pide a G7; G7 los concede a `modulo-marketplace` (verificado el 27/11/2026). */
export const COMMERCE_SCOPES = ['precios:leer', 'inventario:disponibilidad:leer'] as const;

const CONFIG_KEYS = [
  'NODE_ENV', 'CATALOG_SOURCE', 'BFF_MODE', 'CATALOG_INTEGRATION_APPROVED',
  'PRODUCTOS_PRICE_INTEGRATION_APPROVED', 'PRODUCTOS_AVAILABILITY_INTEGRATION_APPROVED',
  'PRODUCTOS_BASE_URL', 'PRODUCTOS_AUTH_MODE', 'PRODUCTOS_TIMEOUT_MS',
  'PRODUCTOS_COMMERCE_CONTRACT_VERSION', 'PRODUCTOS_COMMERCE_CONTRACT_BLOB',
  'G7_TOKEN_URL', 'PRODUCTOS_CLIENT_SECRET',
] as const;

let cached: { key: string; adapter: G6CommerceAdapter } | undefined;

/**
 * Cierre por defecto: se comprueba ANTES de cualquier llamada a G6 (incluida la de
 * variantes). Sin aprobación global y por operación no sale ninguna petición.
 */
export function assertOperationApproved(
  kind: 'price' | 'availability',
  env: CatalogEnvironment = process.env,
): void {
  const gate = kind === 'price' ? 'PRODUCTOS_PRICE_INTEGRATION_APPROVED' : 'PRODUCTOS_AVAILABILITY_INTEGRATION_APPROVED';
  const values = env as Record<string, string | undefined>;
  if (values.CATALOG_INTEGRATION_APPROVED !== 'true' || values[gate] !== 'true') {
    throw new RealCommerceError('UNAVAILABLE');
  }
}

/** Adaptador memoizado por configuración efectiva (reutiliza el token de G7 entre peticiones). */
export function getRealCommerceAdapter(env: CatalogEnvironment = process.env): G6CommerceAdapter {
  const key = JSON.stringify(CONFIG_KEYS.map((name) => (env as Record<string, string | undefined>)[name] ?? ''));
  if (cached?.key === key) return cached.adapter;
  try {
    const timeoutMs = Number(env.PRODUCTOS_TIMEOUT_MS || 5000);
    const auth = createG6Auth(env, fetch, timeoutMs, COMMERCE_SCOPES);
    const adapter = createG6CommerceAdapter(env, () => auth.getAuthorization());
    cached = { key, adapter };
    return adapter;
  } catch {
    throw new RealCommerceError('UNAVAILABLE');
  }
}

/** Resuelve productId y SKU de un producto REAL a partir de sus variantes. */
export async function resolveRealSku(
  slug: string,
  sku?: string,
  env: CatalogEnvironment = process.env,
): Promise<ResolvedSku> {
  let variants;
  try {
    variants = await realProductVariants(slug, env);
  } catch (error) {
    if (error instanceof BffCatalogException) {
      if (error.getStatus() === 400) throw new RealCommerceError('INVALID_SLUG');
      if (error.getStatus() === 404) throw new RealCommerceError('NOT_AVAILABLE');
      if (error.getStatus() === 504) throw new RealCommerceError('TIMEOUT');
      if (error.getStatus() === 502) throw new RealCommerceError('INVALID');
    }
    throw new RealCommerceError('UNAVAILABLE');
  }

  const { productId, hasVariants } = variants.data;
  const skus = variants.data.variants.map((variant) => variant.sku);
  // Un producto sin variantes no expone su SKU base en el BFF: no se inventa.
  if (!hasVariants || skus.length === 0) throw new RealCommerceError('UNAVAILABLE');
  if (sku !== undefined) {
    if (!skus.includes(sku)) throw new RealCommerceError('SKU_MISMATCH');
    return { productId, sku };
  }
  // Sin SKU solo se resuelve si hay una única variante; con varias hay que elegir.
  if (skus.length === 1) return { productId, sku: skus[0] };
  throw new RealCommerceError('SELECTION_REQUIRED');
}
