/**
 * ⚠️ MOCK — Registro canónico de SKUs vendibles de los fixtures de catálogo.
 *
 * Un SKU por producto simple y un SKU por variante activa. Lo consumen los
 * adaptadores MOCK de F-012 (precio), F-013 (variantes) y F-014
 * (disponibilidad) para validar la relación `productId`–`sku` antes de
 * responder, igual que hará el BFF real.
 *
 * `PRD-MOCK-001` conserva `SKU-MOCK-001`; los 32 productos del listado usan
 * `SKU-MOCK-002..033` para no colisionar con el producto simple (ver nota en
 * `product-price.fixture.ts` sobre el mapeo aún abierto de PR #23).
 */

export const MOCK_SIMPLE_PRODUCT_ID = 'PRD-MOCK-001';
export const MOCK_SIMPLE_SKU = 'SKU-MOCK-001';

export const MOCK_VARIABLE_PRODUCT_ID = 'PRD-VAR-MOCK-001';
export const MOCK_VARIABLE_SLUG = 'producto-variable-mock';
export const MOCK_VARIANT_SKUS = [
  'SKU-MOCK-VAR-1',
  'SKU-MOCK-VAR-2',
  'SKU-MOCK-VAR-3',
] as const;

export function mockDemoProductId(number: number): string {
  return `mock-product-${number}`;
}

export function mockDemoSku(number: number): string {
  return `SKU-MOCK-${String(number + 1).padStart(3, '0')}`;
}

/** SKUs conocidos por `productId` (activos; no implica que tengan precio). */
export const MOCK_SKUS_BY_PRODUCT_ID: ReadonlyMap<string, readonly string[]> =
  new Map([
    [MOCK_SIMPLE_PRODUCT_ID, [MOCK_SIMPLE_SKU]],
    [MOCK_VARIABLE_PRODUCT_ID, MOCK_VARIANT_SKUS],
    ...Array.from({ length: 32 }, (_, index) => {
      const number = index + 1;
      return [mockDemoProductId(number), [mockDemoSku(number)]] as [
        string,
        readonly string[],
      ];
    }),
  ]);

export function mockSkusForProduct(
  productId: string,
): readonly string[] {
  return MOCK_SKUS_BY_PRODUCT_ID.get(productId) ?? [];
}
