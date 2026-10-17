/**
 * Controlador BFF — Detalle de Producto (F-011)
 *
 * Endpoint: GET /api/v1/catalog/products/:slug
 *
 * Valida el slug antes de pasarlo al servicio y expone el header
 * `X-Catalog-Source` que consume el proxy compartido del frontend.
 *
 * Códigos HTTP de respuesta (códigos según contrato API F-011 v1):
 *   400 — Slug inválido (formato) → INVALID_PRODUCT_SLUG
 *   404 — Producto no encontrado → PRODUCT_NOT_AVAILABLE
 *   502 — Respuesta de Productos malformada → PRODUCT_CATALOG_INVALID_RESPONSE
 *   503 — BFF sin disponibilidad → PRODUCT_CATALOG_UNAVAILABLE
 *   504 — Timeout hacia Productos → PRODUCT_CATALOG_TIMEOUT (post I-01)
 *   404 — Slug ausente (`/products` sin segmento) → ruta del listado F-006/F-007
 *
 * Los errores responden en el sobre uniforme `application/problem+json`
 * (RFC 9457: type, title, status, code, instance, requestId) vía
 * `ProblemDetailsFilter`, y toda respuesta incluye `X-Request-Id`
 * (middleware global de correlación).
 *
 * ⚠️ MOCK — H3: respuestas provienen de fixtures.
 *
 * @see SPECS/contrato-api/F-011-detalle-producto.md
 */

import {
  CallHandler,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  Param,
  UseFilters,
  UseInterceptors,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { ProblemDetailsFilter } from '../http/problem-details.filter';
import type { ProductDetailResponseDTO } from './product-detail.dto';
import { CatalogException, ERROR_CODES } from './product-detail.errors';
import { ProductDetailService } from './product-detail.service';

// ─── Validación del slug (misma regla que el frontend) ──────────
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MAX_LENGTH = 120;

interface SlugValidation {
  valid: boolean;
  error?: string;
}

/**
 * Valida el formato de un slug de producto (1–120 caracteres,
 * sólo minúsculas, dígitos y guiones).
 */
function validateSlug(slug: string): SlugValidation {
  if (!slug || typeof slug !== 'string') {
    return { valid: false, error: 'El slug es requerido' };
  }
  if (slug.length > SLUG_MAX_LENGTH) {
    return {
      valid: false,
      error: `El slug excede la longitud máxima de ${SLUG_MAX_LENGTH} caracteres`,
    };
  }
  if (!SLUG_PATTERN.test(slug)) {
    return {
      valid: false,
      error: 'El slug tiene formato inválido. Solo se permiten minúsculas, dígitos y guiones',
    };
  }
  return { valid: true };
}

/**
 * Origen de las respuestas del catálogo para el header `X-Catalog-Source`
 * (consumido por el proxy compartido del frontend `/api/catalog/...`).
 * MOCK mientras I-01 esté bloqueado; REAL cuando opere el adaptador.
 */
function catalogSource(): 'MOCK' | 'REAL' {
  return (process.env.BFF_MODE ?? 'mock') === 'mock' ? 'MOCK' : 'REAL';
}

/**
 * Cabecera de origen en éxito y error de este endpoint (staged en la
 * respuesta por Express; aplica también cuando se lanza una excepción).
 */
@Injectable()
class CatalogSourceInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler<unknown>): Observable<unknown> {
    const response = context.switchToHttp().getResponse<{ setHeader(name: string, value: string): void }>();
    response.setHeader('X-Catalog-Source', catalogSource());
    return next.handle();
  }
}

@Controller('api/v1/catalog/products')
@UseInterceptors(CatalogSourceInterceptor)
@UseFilters(new ProblemDetailsFilter())
export class ProductDetailController {
  constructor(private readonly productDetail: ProductDetailService) {}

  @Get(':slug')
  async getBySlug(@Param('slug') slug: string): Promise<ProductDetailResponseDTO> {
    // Validar slug ANTES de llamar al servicio
    const validation = validateSlug(slug);
    if (!validation.valid) {
      throw new CatalogException(400, ERROR_CODES.INVALID_PRODUCT_SLUG, validation.error ?? 'Slug inválido');
    }

    try {
      return await this.productDetail.getBySlug(slug);
    } catch (error) {
      if (error instanceof CatalogException) throw error;

      // Error inesperado — sin exponer detalles internos (sin PII en logs)
      console.error('[BFF Catalog] Error inesperado en getBySlug');
      throw new CatalogException(
        502,
        ERROR_CODES.PRODUCT_CATALOG_INVALID_RESPONSE,
        'Error al obtener datos del catálogo',
      );
    }
  }
}
