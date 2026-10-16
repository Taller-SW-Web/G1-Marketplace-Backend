/**
 * Servicio BFF — Detalle de Producto (F-011)
 *
 * Responsabilidades:
 *   - En modo MOCK (H3): retornar fixture según slug recibido
 *   - En modo REAL (post I-01): llamar a Productos y Ofertas, mapear respuesta al DTO
 *
 * ⚠️ MOCK — Mientras I-01 esté bloqueado, solo se retornan fixtures.
 *
 * @see SPECS/contrato-api/F-011-detalle-producto.md
 */

import { Injectable } from '@nestjs/common';
import {
  isProductDetailResponse,
  type ProductDetailResponseDTO,
} from './product-detail.dto';
import { MOCK_PRODUCT_NO_SPECS, MOCK_PRODUCT_SIMPLE } from './product-detail.fixture';
import { CatalogException, ERROR_CODES } from './product-detail.errors';

/** Latencia simulada del modo MOCK (ms). */
const MOCK_LATENCY_MS = 150;

/** Simula latencia de red para hacer más realista el modo MOCK. */
function simulateLatency(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));
}

@Injectable()
export class ProductDetailService {
  /**
   * Obtiene el detalle de un producto por slug.
   *
   * @param {string} slug - Slug del producto (ya validado por el controlador)
   * @returns {Promise<ProductDetailResponseDTO>} Ficha del contrato F-011
   * @throws {CatalogException} 404 si no se encuentra, 503 si no disponible,
   *   504 en timeout (slugs MOCK) o 502 si la respuesta no cumple el contrato
   */
  async getBySlug(slug: string): Promise<ProductDetailResponseDTO> {
    // Modo MOCK activo mientras I-01 esté bloqueado
    const bffMode = process.env.BFF_MODE ?? 'mock';

    if (bffMode === 'mock') {
      await simulateLatency();

      if (slug === 'producto-no-existente-mock') {
        throw new CatalogException(404, ERROR_CODES.PRODUCT_NOT_AVAILABLE, 'Producto no encontrado');
      }
      if (slug === 'producto-error-503-mock') {
        throw new CatalogException(503, ERROR_CODES.PRODUCT_CATALOG_UNAVAILABLE, 'Servicio de catálogo no disponible');
      }
      if (slug === 'producto-error-504-mock') {
        throw new CatalogException(504, ERROR_CODES.PRODUCT_CATALOG_TIMEOUT, 'Timeout al consultar el servicio de catálogo');
      }

      const fixture =
        slug === 'producto-sin-specs-mock' ? MOCK_PRODUCT_NO_SPECS : MOCK_PRODUCT_SIMPLE;
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

    // TODO (post I-01): llamar a Productos y Ofertas y mapear respuesta
    throw new CatalogException(
      503,
      ERROR_CODES.PRODUCT_CATALOG_UNAVAILABLE,
      'I-01 gate not closed — integración no disponible',
    );
  }
}
