/**
 * ⚠️ MOCK — Solo desarrollo local / H3-H4. No usar en producción.
 *
 * Fixtures de precio para `GET /api/v1/catalog/products/:slug/price`.
 * Simulan la respuesta de Pricing (Productos y Ofertas) mientras I-01 siga
 * bloqueado. Sólo se declaran los importes autoritativos (`regularAmount`,
 * `saleAmount`, `currency`, vigencia y versión); el descuento lo deriva el
 * servicio con `deriveDiscountPercent`.
 *
 * SKUs MOCK:
 *   PRD-MOCK-001        → SKU-MOCK-001  (producto simple de F-011)
 *   mock-product-1..32  → SKU-MOCK-002..033
 *   PRD-VAR-MOCK-001    → SKU-MOCK-VAR-1..3
 *
 * Nota: `src/cart/mock-product-sku.ts` (PR #23, aún abierto) mapea
 * `mock-product-1..32 → SKU-MOCK-001..032`, lo que colisiona con
 * `PRD-MOCK-001 → SKU-MOCK-001`. Aquí se usa el rango 002..033 para que cada
 * producto tenga un SKU único; PR #23 debe alinearse antes de integrar F-016.
 *
 * @see SPECS/contrato-api/F-012-precio-oferta-descuento.md · Gate I-01
 */

import {
  MOCK_SIMPLE_PRODUCT_ID,
  MOCK_SIMPLE_SKU,
  MOCK_VARIABLE_PRODUCT_ID,
  MOCK_VARIABLE_SLUG,
  MOCK_VARIANT_SKUS,
  mockDemoProductId,
  mockDemoSku,
} from './mock-sku';
import type { PriceDTO } from './product-price.dto';

export interface MockPriceProduct {
  productId: string;
  slug: string;
  hasVariants: boolean;
  /** SKU vendible del producto simple; `null` si requiere selección F-013. */
  baseSku: string | null;
  /** Precios por SKU. Un SKU sin entrada representa `422 PRICE_NOT_AVAILABLE`. */
  prices: Readonly<Record<string, PriceDTO>>;
}

const SALE_FROM = '2026-09-01T00:00:00Z';
const SALE_UNTIL = '2026-12-31T23:59:59Z';

function regularPrice(amount: number, priceVersion = 1): PriceDTO {
  return {
    regularAmount: amount,
    saleAmount: null,
    currency: 'PEN',
    discountPercent: null,
    validFrom: SALE_FROM,
    validUntil: null,
    priceVersion,
  };
}

function salePrice(
  regularAmount: number,
  saleAmount: number,
  priceVersion = 1,
): PriceDTO {
  return {
    regularAmount,
    saleAmount,
    currency: 'PEN',
    // El servicio lo recalcula; se deja null para no duplicar la regla.
    discountPercent: null,
    validFrom: SALE_FROM,
    validUntil: SALE_UNTIL,
    priceVersion,
  };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function demoPriceProduct(number: number): MockPriceProduct {
  const sku = mockDemoSku(number);
  const regularAmount = roundMoney(79.9 + number * 10);
  const hasOffer = number % 4 === 0;
  return {
    productId: mockDemoProductId(number),
    slug: `producto-demostracion-${number}`,
    hasVariants: false,
    baseSku: sku,
    prices: {
      [sku]: hasOffer
        ? salePrice(regularAmount, roundMoney(regularAmount * 0.85))
        : regularPrice(regularAmount),
    },
  };
}

export const MOCK_PRICE_SIMPLE: MockPriceProduct = {
  productId: MOCK_SIMPLE_PRODUCT_ID,
  slug: 'zapatillas-running-aero-x',
  hasVariants: false,
  baseSku: MOCK_SIMPLE_SKU,
  prices: {
    [MOCK_SIMPLE_SKU]: salePrice(299.9, 254.9, 8),
  },
};

export const MOCK_PRICE_VARIABLE: MockPriceProduct = {
  productId: MOCK_VARIABLE_PRODUCT_ID,
  slug: MOCK_VARIABLE_SLUG,
  hasVariants: true,
  baseSku: null,
  prices: {
    [MOCK_VARIANT_SKUS[0]]: salePrice(349.9, 299.9, 3),
    [MOCK_VARIANT_SKUS[1]]: regularPrice(349.9, 3),
    // MOCK_VARIANT_SKUS[2] no tiene precio comercial vigente → 422.
  },
};

const entries: Array<[string, MockPriceProduct]> = [
  [MOCK_PRICE_SIMPLE.slug, MOCK_PRICE_SIMPLE],
  [MOCK_PRICE_VARIABLE.slug, MOCK_PRICE_VARIABLE],
  ...Array.from({ length: 32 }, (_, index) => {
    const product = demoPriceProduct(index + 1);
    return [product.slug, product] as [string, MockPriceProduct];
  }),
];

/** Índice slug → producto MOCK con precios. Sin fallback: desconocido → 404. */
export const MOCK_PRICE_PRODUCTS_BY_SLUG: ReadonlyMap<string, MockPriceProduct> =
  new Map(entries);
