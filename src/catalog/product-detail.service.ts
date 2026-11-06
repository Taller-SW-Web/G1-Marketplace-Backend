/**
 * Servicio BFF — Detalle de Producto (F-011)
 *
 * Responsabilidades:
 *   - En modo MOCK (H3): retornar fixture según slug recibido
 *   - En modo REAL opt-in: llamar a G6 y mapear el contrato F-011 sin fallback.
 *
 * REAL requires explicit configuration. Upstream failures never return fixtures.
 *
 * @see SPECS/contrato-api/F-011-detalle-producto.md
 */

import { Injectable } from '@nestjs/common';
import { realProductDetail } from './product-detail.real';
import { createG6Client, G6_CLIENT_CONFIG_KEYS } from './g6-client';
import {
  isProductDetailResponse,
  type ProductDetailResponseDTO,
} from './product-detail.dto';
import { MOCK_PRODUCT_NO_SPECS, MOCK_PRODUCTS_BY_SLUG } from './product-detail.fixture';
import { CatalogException, ERROR_CODES } from './product-detail.errors';

/** Latencia simulada del modo MOCK (ms). */
const MOCK_LATENCY_MS = 150;

/** Simula latencia de red para hacer más realista el modo MOCK. */
function simulateLatency(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));
}

@Injectable()
export class ProductDetailService {
  private realClient?: { values: Array<string | undefined>; client: ReturnType<typeof createG6Client> };

  private configuredClient() {
    const values = G6_CLIENT_CONFIG_KEYS.map(key => process.env[key]);
    if (this.realClient && this.realClient.values.every((value, index) => value === values[index]))
      return this.realClient.client;
    const client = createG6Client(process.env, fetch);
    this.realClient = { values, client };
    return client;
  }
  /**
   * Obtiene el detalle de un producto por slug.
   *
   * @param {string} slug - Slug del producto (ya validado por el controlador)
   * @returns {Promise<ProductDetailResponseDTO>} Ficha del contrato F-011
   * @throws {CatalogException} 404 si no se encuentra, 503 si no disponible,
   *   504 en timeout (slugs MOCK) o 502 si la respuesta no cumple el contrato
   */
  async getBySlug(slug: string, requestId?: string): Promise<ProductDetailResponseDTO> {
    // REAL selection always wins over fixture defaults; misconfiguration fails closed.
    const bffMode = process.env.BFF_MODE ?? 'mock';

    if (process.env.CATALOG_SOURCE === 'real' ||
        ['public-read-only', 'client-credentials'].includes(process.env.PRODUCTOS_AUTH_MODE ?? '') || bffMode !== 'mock')
      return realProductDetail(slug, process.env, fetch, requestId, () => this.configuredClient());

    await simulateLatency();

    if (slug === 'producto-error-503-mock') {
      throw new CatalogException(503, ERROR_CODES.PRODUCT_CATALOG_UNAVAILABLE, 'Servicio de catálogo no disponible');
    }
    if (slug === 'producto-error-504-mock') {
      throw new CatalogException(504, ERROR_CODES.PRODUCT_CATALOG_TIMEOUT, 'Timeout al consultar el servicio de catálogo');
    }

    // Lookup por slug conocido — sin fallback: 'producto-no-existente-mock'
    // y cualquier slug fuera del fixture responden 404 (cada tarjeta del
    // listado F-006/F-007 tiene su ficha en MOCK_PRODUCTS_BY_SLUG).
    const fixture =
      slug === 'producto-sin-specs-mock'
        ? MOCK_PRODUCT_NO_SPECS
        : MOCK_PRODUCTS_BY_SLUG.get(slug);
    if (!fixture) {
      throw new CatalogException(404, ERROR_CODES.PRODUCT_NOT_AVAILABLE, 'Producto no encontrado');
    }
    const response: ProductDetailResponseDTO = {
      ...fixture,
      meta: { source: 'MOCK', retrievedAt: new Date().toISOString() },
    };

    // Guardia de contrato: respuesta malformada → 502 (API-CA-F011-04)
    if (!isProductDetailResponse(response)) {
      throw new CatalogException(
        502,
        ERROR_CODES.PRODUCT_CATALOG_INVALID_RESPONSE,
        'Respuesta del catálogo fuera de contrato',
      );
    }

    return response;
  }
}
