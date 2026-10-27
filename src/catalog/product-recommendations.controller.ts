/**
 * Controlador BFF — Productos relacionados (F-015)
 *
 * Endpoint: GET /api/v1/catalog/products/:slug/recommendations
 *
 * Región no crítica: un fallo técnico se degrada a `200` con arreglo vacío.
 * Sólo un slug fuera del patrón canónico responde `400 INVALID_PRODUCT_SLUG`.
 *
 * ⚠️ MOCK — H3/H4: respuestas desde fixtures hasta cerrar I-01.
 *
 * @see SPECS/contrato-api/F-015-productos-relacionados.md
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
import type { RecommendationsResponseDTO } from './product-recommendations.dto';
import { ProductRecommendationsService } from './product-recommendations.service';
import { validateProductSlug } from './product-slug';

const INVALID_PRODUCT_SLUG = 'INVALID_PRODUCT_SLUG';

@Controller('api/v1/catalog/products')
@UseInterceptors(CatalogSourceInterceptor)
@UseFilters(new ProblemDetailsFilter())
export class ProductRecommendationsController {
  constructor(
    private readonly productRecommendations: ProductRecommendationsService,
  ) {}

  @Get(':slug/recommendations')
  async getRecommendations(
    @Param('slug') slug: string,
  ): Promise<RecommendationsResponseDTO> {
    const validation = validateProductSlug(slug);
    if (!validation.valid) {
      throw new BffCatalogException(
        400,
        INVALID_PRODUCT_SLUG,
        validation.error ?? 'Slug inválido',
      );
    }

    return this.productRecommendations.getRecommendations(slug);
  }
}
