/**
 * Servicio BFF — Atributos y variantes (F-013)
 *
 * Responsabilidades:
 *   - En modo MOCK: devolver las variantes fixture del slug.
 *   - Filtrar variantes no activas antes de validar el contrato.
 *   - En modo REAL explícito: reutilizar el detalle comercial G6 para F-013,
 *     validando etiquetas/combinaciones sin exponer stock ni precio.
 *
 * @see SPECS/contrato-api/F-013-seleccion-atributos-variante.md
 */

import { Injectable } from '@nestjs/common';
import { createG6Client, G6_CLIENT_CONFIG_KEYS } from './g6-client';
import { realProductVariants } from './product-variants.real';
import { BffCatalogException } from './bff-catalog.exception';
import type { ProductVariantDTO } from './product-variants.dto';
import {
  isProductVariantsResponse,
  type ProductVariantsResponseDTO,
} from './product-variants.dto';
import { VARIANT_ERROR_CODES } from './product-variants.errors';
import {
  MOCK_VARIANTS_BY_SLUG,
  type MockVariantFixture,
} from './product-variants.fixture';

const MOCK_LATENCY_MS = 120;

const MOCK_ERROR_SLUGS: Readonly<
  Record<string, { status: number; code: string; message: string }>
> = {
  'producto-error-502-variantes-mock': {
    status: 502,
    code: VARIANT_ERROR_CODES.CATALOG_INVALID_RESPONSE,
    message: 'Respuesta de variantes fuera de contrato',
  },
  'producto-error-503-variantes-mock': {
    status: 503,
    code: VARIANT_ERROR_CODES.CATALOG_UNAVAILABLE,
    message: 'No pudimos consultar las variantes en este momento',
  },
  'producto-error-504-variantes-mock': {
    status: 504,
    code: VARIANT_ERROR_CODES.CATALOG_TIMEOUT,
    message: 'La consulta de variantes tardó demasiado',
  },
};

function simulateLatency(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));
}

const isActiveVariant = (
  variant: MockVariantFixture,
): variant is ProductVariantDTO => variant.status === 'ACTIVE';

@Injectable()
export class ProductVariantsService {
  private realClient?: { values: Array<string | undefined>; client: ReturnType<typeof createG6Client> };

  private configuredClient() {
    const values = G6_CLIENT_CONFIG_KEYS.map(key => process.env[key]);
    if (this.realClient && this.realClient.values.every((value, index) => value === values[index])) return this.realClient.client;
    const client = createG6Client(process.env, fetch);
    this.realClient = { values, client };
    return client;
  }
  /**
   * Obtiene atributos y variantes activas de un producto.
   *
   * @param slug - Slug ya validado por el controlador
   * @throws {BffCatalogException} 404, 502, 503 o 504 según contrato
   */
  async getBySlug(slug: string, requestId?: string): Promise<ProductVariantsResponseDTO> {
    const bffMode = process.env.BFF_MODE ?? 'mock';
    if (process.env.CATALOG_SOURCE === 'real' ||
        ['public-read-only', 'client-credentials'].includes(process.env.PRODUCTOS_AUTH_MODE ?? '') || bffMode !== 'mock')
      return realProductVariants(slug, process.env, fetch, requestId, () => this.configuredClient());

    await simulateLatency();

    const mockError = MOCK_ERROR_SLUGS[slug];
    if (mockError) {
      throw new BffCatalogException(
        mockError.status,
        mockError.code,
        mockError.message,
      );
    }

    const fixture = MOCK_VARIANTS_BY_SLUG.get(slug);
    if (!fixture) {
      throw new BffCatalogException(
        404,
        VARIANT_ERROR_CODES.PRODUCT_NOT_AVAILABLE,
        'Producto no encontrado',
      );
    }

    const response: ProductVariantsResponseDTO = {
      data: {
        ...fixture.data,
        variants: fixture.data.variants.filter(isActiveVariant),
      },
    };

    // Un producto con variantes que queda sin combinaciones activas no es
    // publicable: se degrada igual que un producto no disponible.
    if (response.data.hasVariants && response.data.variants.length === 0) {
      throw new BffCatalogException(
        404,
        VARIANT_ERROR_CODES.PRODUCT_NOT_AVAILABLE,
        'Producto no disponible',
      );
    }

    if (!isProductVariantsResponse(response)) {
      throw new BffCatalogException(
        502,
        VARIANT_ERROR_CODES.CATALOG_INVALID_RESPONSE,
        'Respuesta de variantes fuera de contrato',
      );
    }

    return response;
  }
}
