/**
 * DTOs y guardias del contrato BFF F-012 — Precio, oferta y descuento.
 *
 * El BFF no es dueño del precio: adapta la respuesta de Pricing y sólo deriva
 * `discountPercent` como representación de los importes autoritativos
 * (RN-F012-03). Una respuesta fuera de contrato nunca llega al frontend y se
 * convierte en `502 PRICING_INVALID_RESPONSE`.
 *
 * ⚠️ MOCK — H3/H4: los importes provienen de fixtures hasta cerrar I-01.
 *
 * @see SPECS/contrato-api/F-012-precio-oferta-descuento.md
 */

export interface PriceDTO {
  regularAmount: number;
  saleAmount: number | null;
  currency: string;
  discountPercent: number | null;
  validFrom: string;
  validUntil: string | null;
  priceVersion: number;
}

export interface ProductPriceDTO {
  productId: string;
  sku: string;
  price: PriceDTO;
}

export interface ProductPriceResponseDTO {
  data: ProductPriceDTO;
  meta: { channel: 'MARKETPLACE'; retrievedAt: string };
}

const ISO_4217 = /^[A-Z]{3}$/u;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isPositiveAmount = (value: unknown): value is number =>
  isFiniteNumber(value) && value > 0;

const isIsoDate = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  !Number.isNaN(Date.parse(value));

const isNonNegativeInteger = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0;

/**
 * RN-F012-03: `round((regularAmount - saleAmount) / regularAmount × 100)`.
 * Devuelve `null` cuando no hay una oferta válida; no inventa 0 %.
 */
export function deriveDiscountPercent(
  regularAmount: number,
  saleAmount: number | null,
): number | null {
  if (!isPositiveAmount(regularAmount)) return null;
  if (
    saleAmount === null ||
    !isPositiveAmount(saleAmount) ||
    saleAmount >= regularAmount
  ) {
    return null;
  }
  return Math.round(((regularAmount - saleAmount) / regularAmount) * 100);
}

/**
 * Aplica la ventana de vigencia en el momento de la consulta:
 * - oferta aún no iniciada o ya vencida → se presenta sólo el precio regular;
 * - oferta vigente → se deriva el descuento de los importes autoritativos.
 *
 * Una oferta con importe inválido NO se descarta silenciosamente: se conserva
 * para que la guardia de contrato responda 502.
 */
export function applyPriceWindow(price: PriceDTO, at: Date): PriceDTO {
  if (price.saleAmount === null) {
    return { ...price, discountPercent: null };
  }

  const from = Date.parse(price.validFrom);
  const until =
    price.validUntil === null ? null : Date.parse(price.validUntil);
  const validWindow =
    !Number.isNaN(from) &&
    (until === null || (!Number.isNaN(until) && until >= from));
  const active =
    validWindow && from <= at.getTime() && (until === null || at.getTime() < until);

  if (!active) {
    return { ...price, saleAmount: null, discountPercent: null, validUntil: null };
  }

  return {
    ...price,
    discountPercent: deriveDiscountPercent(price.regularAmount, price.saleAmount),
  };
}

/**
 * Guardia estructural + semántica del contrato F-012 v1.
 * Se ejecuta después de `applyPriceWindow`: aquí `discountPercent` debe ser
 * coherente con los importes y la vigencia.
 */
export function isProductPriceResponse(
  value: unknown,
): value is ProductPriceResponseDTO {
  if (!value || typeof value !== 'object') return false;
  const { data, meta } = value as ProductPriceResponseDTO;
  if (!data || typeof data !== 'object') return false;
  if (typeof data.productId !== 'string' || data.productId.length === 0) {
    return false;
  }
  if (typeof data.sku !== 'string' || data.sku.length === 0) return false;

  const price = data.price;
  if (!price || typeof price !== 'object') return false;
  if (!isPositiveAmount(price.regularAmount)) return false;
  if (typeof price.currency !== 'string' || !ISO_4217.test(price.currency)) {
    return false;
  }
  if (!isIsoDate(price.validFrom)) return false;
  if (!isNonNegativeInteger(price.priceVersion)) return false;

  if (price.saleAmount === null) {
    if (price.discountPercent !== null) return false;
  } else {
    if (
      !isPositiveAmount(price.saleAmount) ||
      price.saleAmount >= price.regularAmount
    ) {
      return false;
    }
    if (!isNonNegativeInteger(price.discountPercent)) return false;
    if (
      price.discountPercent !==
      deriveDiscountPercent(price.regularAmount, price.saleAmount)
    ) {
      return false;
    }
  }

  if (price.validUntil !== null) {
    if (!isIsoDate(price.validUntil)) return false;
    if (Date.parse(price.validUntil) < Date.parse(price.validFrom)) return false;
  }

  if (!meta || typeof meta !== 'object') return false;
  if (meta.channel !== 'MARKETPLACE') return false;
  if (!isIsoDate(meta.retrievedAt)) return false;

  return true;
}
