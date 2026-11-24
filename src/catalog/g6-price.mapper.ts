import { BffCatalogException } from './bff-catalog.exception';
import {
  applyPriceWindow,
  isProductPriceResponse,
  type ProductPriceResponseDTO,
} from './product-price.dto';
import { PRICE_ERROR_CODES } from './product-price.errors';

type G6PriceContext = {
  productId: string;
  sku: string;
  retrievedAt: string;
};

function invalid(): never {
  throw new BffCatalogException(
    502,
    PRICE_ERROR_CODES.PRICING_INVALID_RESPONSE,
    'Respuesta de precios fuera de contrato',
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

/** Maps the pinned G6 `Precio` resource to the public F-012 projection. */
export function mapG6Price(payload: unknown, context: G6PriceContext): ProductPriceResponseDTO {
  if (!record(payload) || payload.sku !== context.sku ||
      typeof payload.precio_regular !== 'number' || !Number.isFinite(payload.precio_regular) || payload.precio_regular <= 0 ||
      (payload.precio_oferta !== undefined && payload.precio_oferta !== null &&
        (typeof payload.precio_oferta !== 'number' || !Number.isFinite(payload.precio_oferta) || payload.precio_oferta <= 0)) ||
      typeof payload.currency !== 'string' || !/^[A-Z]{3}$/u.test(payload.currency) ||
      (payload.channel_id !== null && payload.channel_id !== 'MARKETPLACE') ||
      !validDate(payload.valid_from) ||
      (payload.valid_until !== undefined && payload.valid_until !== null && !validDate(payload.valid_until)) ||
      typeof payload.price_version !== 'number' || !Number.isSafeInteger(payload.price_version) || payload.price_version < 0 ||
      typeof payload.vigencia_id !== 'string' || payload.vigencia_id.trim().length === 0 ||
      !['PRODUCTO', 'SKU_OVERRIDE'].includes(String(payload.origen)) ||
      !validDate(context.retrievedAt) || !context.productId.trim()) {
    return invalid();
  }

  const price = applyPriceWindow({
    regularAmount: payload.precio_regular,
    saleAmount: typeof payload.precio_oferta === 'number' ? payload.precio_oferta : null,
    currency: payload.currency,
    discountPercent: null,
    validFrom: payload.valid_from,
    validUntil: typeof payload.valid_until === 'string' ? payload.valid_until : null,
    priceVersion: payload.price_version,
  }, new Date(context.retrievedAt));
  const response: ProductPriceResponseDTO = {
    data: { productId: context.productId, sku: context.sku, price },
    meta: { channel: 'MARKETPLACE', retrievedAt: context.retrievedAt },
  };
  if (!isProductPriceResponse(response)) return invalid();
  return response;
}
