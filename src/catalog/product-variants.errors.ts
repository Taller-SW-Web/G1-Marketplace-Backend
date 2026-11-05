/**
 * Códigos publicados por el contrato API F-013 v1.
 *
 * @see SPECS/contrato-api/F-013-seleccion-atributos-variante.md
 */

export const VARIANT_ERROR_CODES = {
  /** 400 — slug fuera del patrón canónico. */
  INVALID_PRODUCT_SLUG: 'INVALID_PRODUCT_SLUG',
  /** 404 — producto inexistente o sin variantes activas publicables. */
  PRODUCT_NOT_AVAILABLE: 'PRODUCT_NOT_AVAILABLE',
  /** 502 — Catálogo devolvió una respuesta fuera de contrato. */
  CATALOG_INVALID_RESPONSE: 'CATALOG_INVALID_RESPONSE',
  /** 503 — no se obtuvo una respuesta utilizable. */
  CATALOG_UNAVAILABLE: 'CATALOG_UNAVAILABLE',
  /** 504 — timeout acordado. */
  CATALOG_TIMEOUT: 'CATALOG_TIMEOUT',
} as const;

export type VariantErrorCode =
  (typeof VARIANT_ERROR_CODES)[keyof typeof VARIANT_ERROR_CODES];
