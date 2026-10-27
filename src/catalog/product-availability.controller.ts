/**
 * Controlador BFF — Disponibilidad comercial (F-014)
 *
 * Endpoint: GET /api/v1/catalog/products/:slug/availability?sku={sku}
 *
 * Códigos HTTP del contrato API F-014 v1:
 *   400 INVALID_PRODUCT_SLUG
 *   404 PRODUCT_NOT_AVAILABLE
 *   409 PRODUCT_VARIANT_SELECTION_REQUIRED | SKU_NOT_BELONG_TO_PRODUCT
 *   502 INVENTORY_INVALID_RESPONSE
 *   503 INVENTORY_UNAVAILABLE
 *   504 INVENTORY_TIMEOUT
 *
 * La lectura no reserva ni descuenta inventario y no expone cantidades.
 *
 * ⚠️ MOCK — H3/H4: respuestas desde fixtures hasta cerrar I-01.
 *
 * @see SPECS/contrato-api/F-014-consultar-disponibilidad-stock.md
 */

import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { BffCatalogException } from './bff-catalog.exception';
import { CatalogSourceInterceptor } from './catalog-source.interceptor';
import { ProblemDetailsFilter } from '../http/problem-details.filter';
import type { ProductAvailabilityResponseDTO } from './product-availability.dto';
import { AVAILABILITY_ERROR_CODES } from './product-availability.errors';
import { ProductAvailabilityService } from './product-availability.service';
import {
  normalizeOptionalSku,
  validateProductSlug,
} from './product-slug';

@Controller('api/v1/catalog/products')
@UseInterceptors(CatalogSourceInterceptor)
@UseFilters(new ProblemDetailsFilter())
export class ProductAvailabilityController {
  constructor(
    private readonly productAvailability: ProductAvailabilityService,
  ) {}

  @Get(':slug/availability')
  @Header('Cache-Control', 'public, max-age=30')
  async getAvailability(
    @Param('slug') slug: string,
    @Query('sku') rawSku?: string,
  ): Promise<ProductAvailabilityResponseDTO> {
    const validation = validateProductSlug(slug);
    if (!validation.valid) {
      throw new BffCatalogException(
        400,
        AVAILABILITY_ERROR_CODES.INVALID_PRODUCT_SLUG,
        validation.error ?? 'Slug inválido',
      );
    }

    try {
      return await this.productAvailability.getAvailability(
        slug,
        normalizeOptionalSku(rawSku),
      );
    } catch (error) {
      if (error instanceof BffCatalogException) throw error;
      console.error('[BFF Catalog] Error inesperado en getAvailability');
      throw new BffCatalogException(
        502,
        AVAILABILITY_ERROR_CODES.INVENTORY_INVALID_RESPONSE,
        'Error al obtener la disponibilidad',
      );
    }
  }
}
