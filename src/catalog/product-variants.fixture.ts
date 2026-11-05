/**
 * ⚠️ MOCK — Solo desarrollo local / H3-H4. No usar en producción.
 *
 * Fixtures de variantes para `GET /api/v1/catalog/products/:slug/variants`.
 * Simulan `EXT-OUT-CAT-02` (Catálogo) mientras I-01 siga bloqueado.
 *
 * El producto `producto-variable-mock` expone dos atributos (color, talla) y
 * tres combinaciones activas; se incluye una cuarta variante en `DRAFT` para
 * verificar que el BFF no la publica.
 *
 * @see SPECS/contrato-api/F-013-seleccion-atributos-variante.md · Gate I-01
 */

import {
  MOCK_SIMPLE_PRODUCT_ID,
  MOCK_VARIABLE_PRODUCT_ID,
  MOCK_VARIABLE_SLUG,
  MOCK_VARIANT_SKUS,
  mockDemoProductId,
} from './mock-sku';
import type {
  ProductVariantDTO,
  VariantAttributeDTO,
} from './product-variants.dto';

/** Variante de origen MOCK: `status` puede ser no público (se filtra). */
export interface MockVariantFixture extends Omit<ProductVariantDTO, 'status'> {
  status: string;
}

export interface MockVariantsFixture {
  data: {
    productId: string;
    hasVariants: boolean;
    attributes: VariantAttributeDTO[];
    variants: MockVariantFixture[];
  };
}

const simple = (productId: string): MockVariantsFixture => ({
  data: {
    productId,
    hasVariants: false,
    attributes: [],
    variants: [],
  },
});

const variableVariant = (
  variantId: string,
  sku: string,
  color: string,
  size: string,
  imageUrl: string,
  status = 'ACTIVE',
): MockVariantFixture => ({
  variantId,
  sku,
  status,
  attributes: { color, size },
  image: { url: imageUrl, alt: `Zapatilla ${color} talla ${size}` },
});

export const MOCK_VARIANTS_SIMPLE = simple(MOCK_SIMPLE_PRODUCT_ID);

export const MOCK_VARIANTS_VARIABLE: MockVariantsFixture = {
  data: {
    productId: MOCK_VARIABLE_PRODUCT_ID,
    hasVariants: true,
    attributes: [
      {
        id: 'color',
        label: 'Color',
        values: [
          { id: 'negro', label: 'Negro' },
          { id: 'blanco', label: 'Blanco' },
        ],
      },
      {
        id: 'size',
        label: 'Talla',
        values: [
          { id: '42', label: '42' },
          { id: '43', label: '43' },
        ],
      },
    ],
    variants: [
      variableVariant(
        'VAR-MOCK-1',
        MOCK_VARIANT_SKUS[0],
        'negro',
        '42',
        'https://placehold.co/600x400?text=AERO-NEGRO-42',
      ),
      variableVariant(
        'VAR-MOCK-2',
        MOCK_VARIANT_SKUS[1],
        'negro',
        '43',
        'https://placehold.co/600x400?text=AERO-NEGRO-43',
      ),
      variableVariant(
        'VAR-MOCK-3',
        MOCK_VARIANT_SKUS[2],
        'blanco',
        '42',
        'https://placehold.co/600x400?text=AERO-BLANCO-42',
      ),
      // Borrador: el BFF debe filtrarlo antes de validar el contrato.
      variableVariant(
        'VAR-MOCK-4',
        'SKU-MOCK-VAR-4',
        'blanco',
        '43',
        'https://placehold.co/600x400?text=AERO-BLANCO-43',
        'DRAFT',
      ),
    ],
  },
};

const entries: Array<[string, MockVariantsFixture]> = [
  ['zapatillas-running-aero-x', MOCK_VARIANTS_SIMPLE],
  [MOCK_VARIABLE_SLUG, MOCK_VARIANTS_VARIABLE],
  ...Array.from({ length: 32 }, (_, index) => {
    const number = index + 1;
    return [
      `producto-demostracion-${number}`,
      simple(mockDemoProductId(number)),
    ] as [string, MockVariantsFixture];
  }),
];

/** Índice slug → variantes MOCK. Sin fallback: desconocido → 404. */
export const MOCK_VARIANTS_BY_SLUG: ReadonlyMap<string, MockVariantsFixture> =
  new Map(entries);
