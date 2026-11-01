/**
 * Módulo BFF de detalle de producto (F-011).
 *
 * Ruta propia bajo el namespace compartido `/api/v1/catalog` — convive con
 * el módulo de listado/inicio F-006/F-007 (`products` exacto) sin choque
 * con `products/:slug`.
 *
 * @see SPECS/contrato-api/F-011-detalle-producto.md
 */

import { Module } from '@nestjs/common';
import { ProductDetailController } from './product-detail.controller';
import { ProductDetailService } from './product-detail.service';

@Module({
  controllers: [ProductDetailController],
  providers: [ProductDetailService],
})
export class ProductDetailModule {}
