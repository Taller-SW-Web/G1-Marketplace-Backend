/**
 * Módulo BFF de la región comercial de la ficha (F-012…F-015).
 *
 * Cada endpoint conserva su propio controlador/servicio/DTO:
 *   - F-012 GET /products/:slug/price
 *   - F-013 GET /products/:slug/variants
 *   - F-014 GET /products/:slug/availability
 *   - F-015 GET /products/:slug/recommendations
 *
 * No colisiona con `ProductDetailController` (`:slug` de un solo segmento) ni
 * con el listado F-006/F-007 (`products` exacto).
 */

import { Module } from '@nestjs/common';
import { ProductAvailabilityController } from './product-availability.controller';
import { ProductAvailabilityService } from './product-availability.service';
import { ProductPriceController } from './product-price.controller';
import { ProductPriceService } from './product-price.service';
import { ProductRecommendationsController } from './product-recommendations.controller';
import { ProductRecommendationsService } from './product-recommendations.service';
import { ProductVariantsController } from './product-variants.controller';
import { ProductVariantsService } from './product-variants.service';

@Module({
  controllers: [
    ProductPriceController,
    ProductVariantsController,
    ProductAvailabilityController,
    ProductRecommendationsController,
  ],
  providers: [
    ProductPriceService,
    ProductVariantsService,
    ProductAvailabilityService,
    ProductRecommendationsService,
  ],
})
export class ProductCommerceModule {}
