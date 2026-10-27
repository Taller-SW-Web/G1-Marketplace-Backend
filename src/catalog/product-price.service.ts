/**
 * Servicio BFF — Precio, oferta y descuento vigente (F-012)
 *
 * Responsabilidades:
 *   - Resolver el SKU aplicable (simple o variante seleccionada) y validar que
 *     pertenezca al producto antes de consultar Pricing.
 *   - En modo MOCK: devolver el precio fixture y derivar `discountPercent`.
 *   - En modo REAL (post I-01): adaptar Pricing y descartar ofertas vencidas.
 *
 * ⚠️ MOCK — Mientras I-01 esté bloqueado sólo se sirven fixtures.
 *
 * @see SPECS/contrato-api/F-012-precio-oferta-descuento.md
 */

import { Injectable } from '@nestjs/common';
import { BffCatalogException } from './bff-catalog.exception';
import { mockSkusForProduct } from './mock-sku';
import {
  applyPriceWindow,
  isProductPriceResponse,
  type ProductPriceResponseDTO,
} from './product-price.dto';
import { PRICE_ERROR_CODES } from './product-price.errors';
import { MOCK_PRICE_PRODUCTS_BY_SLUG } from './product-price.fixture';

const MOCK_LATENCY_MS = 120;

/** Slugs especiales de prueba: error ya normalizado del adaptador MOCK. */
const MOCK_ERROR_SLUGS: Readonly<
  Record<string, { status: number; code: string; message: string }>
> = {
  'producto-error-422-precio-mock': {
    status: 422,
    code: PRICE_ERROR_CODES.PRICE_NOT_AVAILABLE,
    message: 'No hay un precio comercial vigente para este producto',
  },
  'producto-error-502-precio-mock': {
    status: 502,
    code: PRICE_ERROR_CODES.PRICING_INVALID_RESPONSE,
    message: 'Respuesta de precios fuera de contrato',
  },
  'producto-error-503-precio-mock': {
    status: 503,
    code: PRICE_ERROR_CODES.PRICING_UNAVAILABLE,
    message: 'No pudimos consultar el precio en este momento',
  },
  'producto-error-504-precio-mock': {
    status: 504,
    code: PRICE_ERROR_CODES.PRICING_TIMEOUT,
    message: 'La consulta de precio tardó demasiado',
  },
};

function simulateLatency(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));
}

@Injectable()
export class ProductPriceService {
  /**
   * Obtiene el precio vigente de un producto/SKU.
   *
   * @param slug - Slug ya validado por el controlador
   * @param sku - SKU opcional; obligatorio para productos con variantes
   * @throws {BffCatalogException} 404, 409, 422, 502, 503 o 504 según contrato
   */
  async getPrice(
    slug: string,
    sku?: string,
  ): Promise<ProductPriceResponseDTO> {
    const bffMode = process.env.BFF_MODE ?? 'mock';
    if (bffMode !== 'mock') {
      // El adaptador real no se activa hasta homologar I-01 / OPEN-03.
      throw new BffCatalogException(
        503,
        PRICE_ERROR_CODES.PRICING_UNAVAILABLE,
        'I-01 gate not closed — pricing integration unavailable',
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

    const product = MOCK_PRICE_PRODUCTS_BY_SLUG.get(slug);
    if (!product) {
      throw new BffCatalogException(
        404,
        PRICE_ERROR_CODES.PRODUCT_NOT_AVAILABLE,
        'Producto no encontrado',
      );
    }

    const knownSkus = mockSkusForProduct(product.productId);
    if (product.hasVariants && !sku) {
      throw new BffCatalogException(
        409,
        PRICE_ERROR_CODES.PRODUCT_VARIANT_SELECTION_REQUIRED,
        'Selecciona una variante para consultar el precio',
      );
    }
    if (sku !== undefined && !knownSkus.includes(sku)) {
      throw new BffCatalogException(
        409,
        PRICE_ERROR_CODES.SKU_NOT_BELONG_TO_PRODUCT,
        'El SKU no corresponde al producto',
      );
    }

    const resolvedSku = sku ?? product.baseSku;
    if (!resolvedSku) {
      throw new BffCatalogException(
        409,
        PRICE_ERROR_CODES.PRODUCT_VARIANT_SELECTION_REQUIRED,
        'Selecciona una variante para consultar el precio',
      );
    }

    const sourcePrice = product.prices[resolvedSku];
    if (!sourcePrice) {
      throw new BffCatalogException(
        422,
        PRICE_ERROR_CODES.PRICE_NOT_AVAILABLE,
        'No hay un precio comercial vigente para este producto',
      );
    }

    const retrievedAt = new Date();
    const response: ProductPriceResponseDTO = {
      data: {
        productId: product.productId,
        sku: resolvedSku,
        price: applyPriceWindow(sourcePrice, retrievedAt),
      },
      meta: {
        channel: 'MARKETPLACE',
        retrievedAt: retrievedAt.toISOString(),
      },
    };

    // Guardia de contrato: una oferta/moneda/importe inválido no se muestra.
    if (!isProductPriceResponse(response)) {
      throw new BffCatalogException(
        502,
        PRICE_ERROR_CODES.PRICING_INVALID_RESPONSE,
        'Respuesta de precios fuera de contrato',
      );
    }

    return response;
  }
}
