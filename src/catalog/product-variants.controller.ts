/**
 * Controlador BFF — Atributos y variantes (F-013)
 *
 * Endpoint: GET /api/v1/catalog/products/:slug/variants
 *
 * Códigos HTTP del contrato API F-013 v1:
 *   400 INVALID_PRODUCT_SLUG
 *   404 PRODUCT_NOT_AVAILABLE
 *   502 CATALOG_INVALID_RESPONSE
 *   503 CATALOG_UNAVAILABLE
 *   504 CATALOG_TIMEOUT
 *
 * ⚠️ MOCK — H3/H4: respuestas desde fixtures hasta cerrar I-01.
 *
 * @see SPECS/contrato-api/F-013-seleccion-atributos-variante.md
 */

import {
  Controller,
  Get,
  Param,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { BffCatalogException } from './bff-catalog.exception';
import { CatalogSourceInterceptor } from './catalog-source.interceptor';
import { ProblemDetailsFilter } from '../http/problem-details.filter';
import { validateProductSlug } from './product-slug';
import type { ProductVariantsResponseDTO } from './product-variants.dto';
import { VARIANT_ERROR_CODES } from './product-variants.errors';
import { ProductVariantsService } from './product-variants.service';

@Controller('api/v1/catalog/products')
@UseInterceptors(CatalogSourceInterceptor)
@UseFilters(new ProblemDetailsFilter())
export class ProductVariantsController {
  constructor(private readonly productVariants: ProductVariantsService) {}

  @Get(':slug/variants')
  async getBySlug(
    @Param('slug') slug: string,
  ): Promise<ProductVariantsResponseDTO> {
    const validation = validateProductSlug(slug);
    if (!validation.valid) {
      throw new BffCatalogException(
        400,
        VARIANT_ERROR_CODES.INVALID_PRODUCT_SLUG,
        validation.error ?? 'Slug inválido',
      );
    }

    try {
      return await this.productVariants.getBySlug(slug);
    } catch (error) {
      if (error instanceof BffCatalogException) throw error;
      console.error('[BFF Catalog] Error inesperado en getBySlug (variants)');
      throw new BffCatalogException(
        502,
        VARIANT_ERROR_CODES.CATALOG_INVALID_RESPONSE,
        'Error al obtener las variantes',
      );
    }
  }
}
