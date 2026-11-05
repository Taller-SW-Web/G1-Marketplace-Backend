/**
 * Códigos publicados por el contrato API F-014 v1.
 *
 * @see SPECS/contrato-api/F-014-consultar-disponibilidad-stock.md
 */

export const AVAILABILITY_ERROR_CODES = {
  /** 400 — slug fuera del patrón canónico. */
  INVALID_PRODUCT_SLUG: 'INVALID_PRODUCT_SLUG',
  /** 404 — producto inexistente o no elegible. */
  PRODUCT_NOT_AVAILABLE: 'PRODUCT_NOT_AVAILABLE',
  /** 409 — producto con variantes sin SKU seleccionado. */
  PRODUCT_VARIANT_SELECTION_REQUIRED: 'PRODUCT_VARIANT_SELECTION_REQUIRED',
  /** 409 — SKU ajeno al producto o no elegible. */
  SKU_NOT_BELONG_TO_PRODUCT: 'SKU_NOT_BELONG_TO_PRODUCT',
  /** 502 — Inventario devolvió un estado fuera de contrato. */
  INVENTORY_INVALID_RESPONSE: 'INVENTORY_INVALID_RESPONSE',
  /** 503 — no se obtuvo una respuesta utilizable. */
  INVENTORY_UNAVAILABLE: 'INVENTORY_UNAVAILABLE',
  /** 504 — timeout acordado. */
  INVENTORY_TIMEOUT: 'INVENTORY_TIMEOUT',
} as const;

export type AvailabilityErrorCode =
  (typeof AVAILABILITY_ERROR_CODES)[keyof typeof AVAILABILITY_ERROR_CODES];
