/**
 * Códigos publicados por el contrato API F-012 v1 (§4 — API-F012-001).
 *
 * @see SPECS/contrato-api/F-012-precio-oferta-descuento.md
 */

export const PRICE_ERROR_CODES = {
  /** 400 — slug fuera del patrón canónico. */
  INVALID_PRODUCT_SLUG: 'INVALID_PRODUCT_SLUG',
  /** 404 — producto inexistente o no elegible. */
  PRODUCT_NOT_AVAILABLE: 'PRODUCT_NOT_AVAILABLE',
  /** 409 — producto con variantes sin SKU seleccionado. */
  PRODUCT_VARIANT_SELECTION_REQUIRED: 'PRODUCT_VARIANT_SELECTION_REQUIRED',
  /** 409 — SKU ajeno al producto o no elegible. */
  SKU_NOT_BELONG_TO_PRODUCT: 'SKU_NOT_BELONG_TO_PRODUCT',
  /** 422 — sin precio comercial vigente para el SKU/canal. */
  PRICE_NOT_AVAILABLE: 'PRICE_NOT_AVAILABLE',
  /** 502 — Pricing devolvió importes, moneda o vigencia inválidos. */
  PRICING_INVALID_RESPONSE: 'PRICING_INVALID_RESPONSE',
  /** 503 — no se obtuvo una respuesta utilizable. */
  PRICING_UNAVAILABLE: 'PRICING_UNAVAILABLE',
  /** 504 — timeout acordado. */
  PRICING_TIMEOUT: 'PRICING_TIMEOUT',
} as const;

export type PriceErrorCode =
  (typeof PRICE_ERROR_CODES)[keyof typeof PRICE_ERROR_CODES];
