/**
 * Servicio BFF — Disponibilidad comercial (F-014)
 *
 * Responsabilidades:
 *   - Resolver el SKU aplicable y validar que pertenezca al producto.
 *   - En modo MOCK: devolver el estado comercial fixture.
 *   - En modo REAL (post I-01): adaptar `EXT-OUT-INV-01` sin saldos ni
 *     ubicaciones.
 *
 * Un fallo de Inventario NUNCA se traduce a `OUT_OF_STOCK` (API-CA-F014-01).
 *
 * ⚠️ MOCK — Mientras I-01 esté bloqueado sólo se sirven fixtures.
 *
 * @see SPECS/contrato-api/F-014-consultar-disponibilidad-stock.md
 */

import { Injectable } from '@nestjs/common';
import { BffCatalogException } from './bff-catalog.exception';
import {
  isProductAvailabilityResponse,
  type ProductAvailabilityResponseDTO,
} from './product-availability.dto';
import { AVAILABILITY_ERROR_CODES } from './product-availability.errors';
import { MOCK_AVAILABILITY_BY_SLUG } from './product-availability.fixture';
import { mockSkusForProduct } from './mock-sku';

const MOCK_LATENCY_MS = 120;

const MOCK_ERROR_SLUGS: Readonly<
  Record<string, { status: number; code: string; message: string }>
> = {
  'producto-error-502-stock-mock': {
    status: 502,
    code: AVAILABILITY_ERROR_CODES.INVENTORY_INVALID_RESPONSE,
    message: 'Respuesta de inventario fuera de contrato',
  },
  'producto-error-503-stock-mock': {
    status: 503,
    code: AVAILABILITY_ERROR_CODES.INVENTORY_UNAVAILABLE,
    message: 'No pudimos consultar la disponibilidad en este momento',
  },
  'producto-error-504-stock-mock': {
    status: 504,
    code: AVAILABILITY_ERROR_CODES.INVENTORY_TIMEOUT,
    message: 'La consulta de disponibilidad tardó demasiado',
  },
};

function simulateLatency(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));
}

@Injectable()
export class ProductAvailabilityService {
  /**
   * Obtiene la disponibilidad comercial de un producto/SKU.
   *
   * @param slug - Slug ya validado por el controlador
   * @param sku - SKU opcional; obligatorio para productos con variantes
   * @throws {BffCatalogException} 404, 409, 502, 503 o 504 según contrato
   */
  async getAvailability(
    slug: string,
    sku?: string,
  ): Promise<ProductAvailabilityResponseDTO> {
    const bffMode = process.env.BFF_MODE ?? 'mock';
    if (bffMode !== 'mock') {
      throw new BffCatalogException(
        503,
        AVAILABILITY_ERROR_CODES.INVENTORY_UNAVAILABLE,
        'I-01 gate not closed — inventory integration unavailable',
      );
    }

    await simulateLatency();

    const mockError = MOCK_ERROR_SLUGS[slug];
    if (mockError) {
      throw new BffCatalogException(
        mockError.status,
        mockError.code,
        mockError.message,
      );
    }

    const product = MOCK_AVAILABILITY_BY_SLUG.get(slug);
    if (!product) {
      throw new BffCatalogException(
        404,
        AVAILABILITY_ERROR_CODES.PRODUCT_NOT_AVAILABLE,
        'Producto no encontrado',
      );
    }

    const knownSkus = mockSkusForProduct(product.productId);
    if (product.hasVariants && !sku) {
      throw new BffCatalogException(
        409,
        AVAILABILITY_ERROR_CODES.PRODUCT_VARIANT_SELECTION_REQUIRED,
        'Selecciona una variante para consultar la disponibilidad',
      );
    }
    if (sku !== undefined && !knownSkus.includes(sku)) {
      throw new BffCatalogException(
        409,
        AVAILABILITY_ERROR_CODES.SKU_NOT_BELONG_TO_PRODUCT,
        'El SKU no corresponde al producto',
      );
    }

    const resolvedSku = sku ?? product.baseSku;
    if (!resolvedSku) {
      throw new BffCatalogException(
        409,
        AVAILABILITY_ERROR_CODES.PRODUCT_VARIANT_SELECTION_REQUIRED,
        'Selecciona una variante para consultar la disponibilidad',
      );
    }

    const availability = product.availability[resolvedSku];
    if (!availability) {
      // Sin proyección comercial no se inventa un estado (ni OUT_OF_STOCK).
      throw new BffCatalogException(
        503,
        AVAILABILITY_ERROR_CODES.INVENTORY_UNAVAILABLE,
        'No pudimos consultar la disponibilidad en este momento',
      );
    }

    const response: ProductAvailabilityResponseDTO = {
      data: {
        productId: product.productId,
        sku: resolvedSku,
        availability,
        checkedAt: new Date().toISOString(),
      },
    };

    if (!isProductAvailabilityResponse(response)) {
      throw new BffCatalogException(
        502,
        AVAILABILITY_ERROR_CODES.INVENTORY_INVALID_RESPONSE,
        'Respuesta de inventario fuera de contrato',
      );
    }

    return response;
  }
}
