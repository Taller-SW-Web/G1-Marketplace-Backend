import { BffCatalogException } from './bff-catalog.exception';
import {
  isProductAvailabilityResponse,
  type CommercialAvailability,
  type ProductAvailabilityResponseDTO,
} from './product-availability.dto';
import { AVAILABILITY_ERROR_CODES } from './product-availability.errors';

const STATES: Readonly<Record<string, CommercialAvailability>> = {
  DISPONIBLE: 'AVAILABLE',
  STOCK_BAJO: 'STOCK_LOW',
  AGOTADO: 'OUT_OF_STOCK',
  INDETERMINADO: 'UNDETERMINED',
};

function invalid(): never {
  throw new BffCatalogException(502, AVAILABILITY_ERROR_CODES.INVENTORY_INVALID_RESPONSE,
    'Respuesta de inventario fuera de contrato');
}

/**
 * Proyección pura de GET comercial G6 para una consulta de un único SKU.
 * El caller debe validar relación producto/SKU y estado HTTP antes de llamarla.
 * No hace I/O ni habilita el adaptador REAL o una reserva.
 */
export function mapG6Availability(
  payload: unknown,
  context: { productId: string; sku: string; checkedAt: string },
): ProductAvailabilityResponseDTO {
  if (!payload || typeof payload !== 'object' || !('items' in payload) ||
      !Array.isArray(payload.items) || payload.items.length !== 1) invalid();
  const item: unknown = payload.items[0];
  if (!item || typeof item !== 'object' || !('sku' in item) || !('status' in item) ||
      item.sku !== context.sku || typeof item.status !== 'string' ||
      !Object.prototype.hasOwnProperty.call(STATES, item.status) ||
      Object.keys(item).length !== 2) invalid();
  const response: ProductAvailabilityResponseDTO = {
    data: {
      productId: context.productId,
      sku: context.sku,
      availability: STATES[item.status],
      checkedAt: context.checkedAt,
    },
  };
  if (!isProductAvailabilityResponse(response)) invalid();
  return response;
}
