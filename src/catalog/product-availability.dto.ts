/**
 * DTOs y guardia del contrato BFF F-014 — Disponibilidad comercial.
 *
 * Sólo se publican los tres estados homologados del contrato v1:
 * `AVAILABLE`, `STOCK_LOW` y `OUT_OF_STOCK`. No se exponen cantidades,
 * ubicaciones, `onHand` ni `reserved`.
 *
 * ⚠️ G-G6-COMPAT: el plan H4 registra que el OpenAPI G6 0.6.0-rc.1 incorpora
 * `INDETERMINADO`. Añadirlo aquí sin homologación bilateral cambiaría el
 * contrato publicado, violando API-CA-F014 y la regla de no inferir estados.
 * Se mantiene v1 hasta que Jim/G6 y Giuliano acuerden la actualización
 * coherente de funcional/UI/API/React y el adaptador.
 *
 * @see SPECS/contrato-api/F-014-consultar-disponibilidad-stock.md
 * @see SPECS/plan/DECISIONES-Y-BLOQUEOS.md — G-G6-COMPAT
 */

export const COMMERCIAL_AVAILABILITY = [
  'AVAILABLE',
  'STOCK_LOW',
  'OUT_OF_STOCK',
] as const;

export type CommercialAvailability = (typeof COMMERCIAL_AVAILABILITY)[number];

export interface ProductAvailabilityDTO {
  productId: string;
  sku: string;
  availability: CommercialAvailability;
  checkedAt: string;
}

export interface ProductAvailabilityResponseDTO {
  data: ProductAvailabilityDTO;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isIsoDate = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  !Number.isNaN(Date.parse(value));

const isCommercialAvailability = (
  value: unknown,
): value is CommercialAvailability =>
  typeof value === 'string' &&
  (COMMERCIAL_AVAILABILITY as readonly string[]).includes(value);

/**
 * Guardia del contrato F-014 v1. Un estado desconocido (por ejemplo
 * `INDETERMINADO`) no se publica como si fuera uno de los tres homologados.
 */
export function isProductAvailabilityResponse(
  value: unknown,
): value is ProductAvailabilityResponseDTO {
  if (!value || typeof value !== 'object') return false;
  const { data } = value as ProductAvailabilityResponseDTO;
  if (!data || typeof data !== 'object') return false;
  if (!isNonEmptyString(data.productId)) return false;
  if (!isNonEmptyString(data.sku)) return false;
  if (!isCommercialAvailability(data.availability)) return false;
  if (!isIsoDate(data.checkedAt)) return false;
  if (
    'quantity' in data ||
    'onHand' in data ||
    'reserved' in data ||
    'locationId' in data
  ) {
    return false;
  }
  return true;
}
