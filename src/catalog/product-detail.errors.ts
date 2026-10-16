/**
 * Códigos de error y excepción HTTP del contrato API F-011 v1 (§4 — API-F011-001).
 *
 * NOTA (H3 / MOCK): PRODUCT_CATALOG_INVALID_RESPONSE (502) y
 * PRODUCT_CATALOG_TIMEOUT (504) sólo son alcanzables post I-01,
 * cuando exista un upstream real de Productos y Ofertas.
 *
 * @see SPECS/contrato-api/F-011-detalle-producto.md
 */

import { HttpException } from '@nestjs/common';

export const ERROR_CODES = {
  /** 400 — el slug no cumple el formato del contrato (validado por el controlador). */
  INVALID_PRODUCT_SLUG: 'INVALID_PRODUCT_SLUG',
  /** 404 — producto inexistente, inactivo o no habilitado para Marketplace. */
  PRODUCT_NOT_AVAILABLE: 'PRODUCT_NOT_AVAILABLE',
  /** 502 — el proveedor respondió pero el contrato no es válido (post I-01). */
  PRODUCT_CATALOG_INVALID_RESPONSE: 'PRODUCT_CATALOG_INVALID_RESPONSE',
  /** 503 — no se puede obtener la ficha ni desde caché permitida. */
  PRODUCT_CATALOG_UNAVAILABLE: 'PRODUCT_CATALOG_UNAVAILABLE',
  /** 504 — el proveedor excede el timeout acordado (post I-01). */
  PRODUCT_CATALOG_TIMEOUT: 'PRODUCT_CATALOG_TIMEOUT',
} as const;

export type ProductDetailErrorCode =
  (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * Excepción HTTP con el sobre de error `{ error: { code, message } }`
 * consumido por el frontend (F-011) durante el corte MOCK de H3.
 * El envelope `application/problem+json` completo queda pendiente post I-01.
 */
export class CatalogException extends HttpException {
  constructor(status: number, code: ProductDetailErrorCode, message: string) {
    super({ error: { code, message } }, status);
  }
}
