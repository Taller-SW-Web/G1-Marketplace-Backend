/**
 * ⚠️ MOCK — Solo desarrollo local / H3-H4. No usar en producción.
 *
 * Fixtures de disponibilidad comercial para
 * `GET /api/v1/catalog/products/:slug/availability?sku=`.
 * Simulan `EXT-OUT-INV-01` (Inventario) sin saldos ni ubicaciones.
 *
 * @see SPECS/contrato-api/F-014-consultar-disponibilidad-stock.md · Gate I-01
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
import type { CommercialAvailability } from './product-availability.dto';

export interface MockAvailabilityProduct {
  productId: string;
  slug: string;
  hasVariants: boolean;
  baseSku: string | null;
  /** Disponibilidad por SKU vendible. */
  availability: Readonly<Record<string, CommercialAvailability>>;
}

function demoAvailability(number: number): CommercialAvailability {
  if (number % 5 === 0) return 'OUT_OF_STOCK';
  if (number % 3 === 0) return 'STOCK_LOW';
  return 'AVAILABLE';
}

export const MOCK_AVAILABILITY_SIMPLE: MockAvailabilityProduct = {
  productId: MOCK_SIMPLE_PRODUCT_ID,
  slug: 'zapatillas-running-aero-x',
  hasVariants: false,
  baseSku: 'SKU-MOCK-001',
  availability: { 'SKU-MOCK-001': 'AVAILABLE' },
};

export const MOCK_AVAILABILITY_VARIABLE: MockAvailabilityProduct = {
  productId: MOCK_VARIABLE_PRODUCT_ID,
  slug: MOCK_VARIABLE_SLUG,
  hasVariants: true,
  baseSku: null,
  availability: {
    [MOCK_VARIANT_SKUS[0]]: 'AVAILABLE',
    [MOCK_VARIANT_SKUS[1]]: 'STOCK_LOW',
    [MOCK_VARIANT_SKUS[2]]: 'OUT_OF_STOCK',
  },
};

const entries: Array<[string, MockAvailabilityProduct]> = [
  [MOCK_AVAILABILITY_SIMPLE.slug, MOCK_AVAILABILITY_SIMPLE],
  [MOCK_AVAILABILITY_VARIABLE.slug, MOCK_AVAILABILITY_VARIABLE],
  ...Array.from({ length: 32 }, (_, index) => {
    const number = index + 1;
    const sku = mockDemoSku(number);
    const product: MockAvailabilityProduct = {
      productId: mockDemoProductId(number),
      slug: `producto-demostracion-${number}`,
      hasVariants: false,
      baseSku: sku,
      availability: { [sku]: demoAvailability(number) },
    };
    return [product.slug, product] as [string, MockAvailabilityProduct];
  }),
];

/** Índice slug → disponibilidad MOCK. Sin fallback: desconocido → 404. */
export const MOCK_AVAILABILITY_BY_SLUG: ReadonlyMap<
  string,
  MockAvailabilityProduct
> = new Map(entries);
