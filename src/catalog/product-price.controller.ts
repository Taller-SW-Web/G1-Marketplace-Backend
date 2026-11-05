/**
 * Controlador BFF — Precio, oferta y descuento vigente (F-012)
 *
 * Endpoint: GET /api/v1/catalog/products/:slug/price?sku={sku-opcional}
 *
 * Códigos HTTP del contrato API F-012 v1 (§4):
 *   400 INVALID_PRODUCT_SLUG
 *   404 PRODUCT_NOT_AVAILABLE
 *   409 PRODUCT_VARIANT_SELECTION_REQUIRED | SKU_NOT_BELONG_TO_PRODUCT
 *   422 PRICE_NOT_AVAILABLE
 *   502 PRICING_INVALID_RESPONSE
 *   503 PRICING_UNAVAILABLE
 *   504 PRICING_TIMEOUT
 *
 * Los errores usan el sobre `application/problem+json` de `ProblemDetailsFilter`
 * y toda respuesta incluye `X-Request-Id` y `X-Catalog-Source`.
 *
 * ⚠️ MOCK — H3/H4: respuestas desde fixtures hasta cerrar I-01.
 *
 * @see SPECS/contrato-api/F-012-precio-oferta-descuento.md
 */

import {
  Controller,
  Get,
  Param,
  Query,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { BffCatalogException } from './bff-catalog.exception';
import { CatalogSourceInterceptor } from './catalog-source.interceptor';
import { ProblemDetailsFilter } from '../http/problem-details.filter';
import {
  normalizeOptionalSku,
  validateProductSlug,
} from './product-slug';
import { PRICE_ERROR_CODES } from './product-price.errors';
import type { ProductPriceResponseDTO } from './product-price.dto';
import { ProductPriceService } from './product-price.service';

@Controller('api/v1/catalog/products')
@UseInterceptors(CatalogSourceInterceptor)
@UseFilters(new ProblemDetailsFilter())
export class ProductPriceController {
  constructor(private readonly productPrice: ProductPriceService) {}

  @Get(':slug/price')
  async getPrice(
    @Param('slug') slug: string,
    @Query('sku') rawSku?: string,
  ): Promise<ProductPriceResponseDTO> {
    const validation = validateProductSlug(slug);
    if (!validation.valid) {
      throw new BffCatalogException(
        400,
        PRICE_ERROR_CODES.INVALID_PRODUCT_SLUG,
        validation.error ?? 'Slug inválido',
      );
    }

    try {
      return await this.productPrice.getPrice(
        slug,
        normalizeOptionalSku(rawSku),
      );
    } catch (error) {
      if (error instanceof BffCatalogException) throw error;
      console.error('[BFF Catalog] Error inesperado en getPrice');
      throw new BffCatalogException(
        502,
        PRICE_ERROR_CODES.PRICING_INVALID_RESPONSE,
        'Error al obtener el precio',
      );
    }
  }
}
