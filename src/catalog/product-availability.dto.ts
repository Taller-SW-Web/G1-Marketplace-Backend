/**
 * F-014: cuatro estados comerciales, conforme a M01 G1/G6 (20/10/2026).
 * UNDETERMINED es un resultado comercial, no un error ni stock agotado.
 * No expone cantidades, ubicación ni garantiza unidades o reserva.
 * La integración REAL conserva su gate; esta proyección no la habilita.
 */

export const COMMERCIAL_AVAILABILITY = [
  'AVAILABLE',
  'STOCK_LOW',
  'OUT_OF_STOCK',
  'UNDETERMINED',
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
 * Guardia del contrato público F-014. Los estados de G6 se traducen antes
 * de validar: `INDETERMINADO` no es el nombre público `UNDETERMINED`.
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
  const keys = ['productId', 'sku', 'availability', 'checkedAt'];
  if (Object.keys(data).length !== keys.length ||
      !keys.every((key) => Object.prototype.hasOwnProperty.call(data, key))) return false;
  return true;
}
