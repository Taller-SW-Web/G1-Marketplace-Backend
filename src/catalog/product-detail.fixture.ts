/**
 * ⚠️ MOCK — Solo desarrollo local / H3. No usar en producción.
 *
 * Fixtures de producto para el endpoint BFF GET /api/v1/catalog/products/:slug
 * Estos datos simulan la respuesta del servicio de Productos y Ofertas
 * mientras el gate I-01 esté bloqueado.
 *
 * @see SPECS/contrato-api/F-011-detalle-producto.md · Gate I-01
 */

import type { ProductDetailResponseDTO } from './product-detail.dto';

/**
 * Producto MOCK estándar con specs y galería.
 * Slug: 'zapatillas-running-aero-x'
 */
export const MOCK_PRODUCT_SIMPLE: ProductDetailResponseDTO = {
  data: {
    productId: 'PRD-MOCK-001',
    slug: 'zapatillas-running-aero-x',
    name: 'Zapatillas Running Aero X [MOCK]',
    brand: { brandId: 'BR-MOCK', name: 'BrandMock' },
    description: 'Descripción de prueba. Producto ficticio.',
    technicalSpecifications: [
      { group: 'Características', name: 'Material', value: 'Malla técnica', displayOrder: 1 },
      { group: 'Características', name: 'Peso', value: '280', unit: 'g', displayOrder: 2 },
    ],
    media: [
      { mediaId: 'MED-001', type: 'IMAGE', url: 'https://placehold.co/600x400', alt: 'Vista frontal [MOCK]', displayOrder: 1 },
      { mediaId: 'MED-002', type: 'IMAGE', url: 'https://placehold.co/600x400?text=2', alt: 'Vista lateral [MOCK]', displayOrder: 2 },
    ],
  },
  meta: { source: 'MOCK', retrievedAt: new Date().toISOString() },
};

/**
 * Producto MOCK sin especificaciones técnicas.
 * Slug especial: 'producto-sin-specs-mock'
 */
export const MOCK_PRODUCT_NO_SPECS: ProductDetailResponseDTO = {
  ...MOCK_PRODUCT_SIMPLE,
  data: { ...MOCK_PRODUCT_SIMPLE.data, technicalSpecifications: [] },
};

/**
 * Producto MOCK con variantes (F-013): permite probar selección de color y
 * talla, precio por SKU y disponibilidad por SKU sin inventar datos reales.
 * Slug: 'producto-variable-mock'.
 */
export const MOCK_PRODUCT_VARIABLE: ProductDetailResponseDTO = {
  ...MOCK_PRODUCT_SIMPLE,
  data: {
    ...MOCK_PRODUCT_SIMPLE.data,
    productId: 'PRD-VAR-MOCK-001',
    slug: 'producto-variable-mock',
    name: 'Zapatillas Variable Mock [MOCK]',
    description:
      'Producto ficticio con color y talla. La variante se elige en la ficha [MOCK].',
  },
};

// ─────────────────────────────────────────────────────────────
// Slugs especiales para pruebas (unit FE, unit BE y e2e):
//   'producto-no-existente-mock'  → responde 404 (cae al lookup: no existe)
//   'producto-error-503-mock'     → responde 503
//   'producto-error-504-mock'     → responde 504
//   'producto-sin-specs-mock'     → specs vacías
// Cualquier slug fuera de este archivo responde 404 (sin fallback).
// ─────────────────────────────────────────────────────────────

/**
 * Productos MOCK del listado F-006/F-007 — espejo exacto de `src/catalog/
 * fixtures.ts` de la rama `feat/s1-f006-f007-catalogo` (PR #11): mismos
 * `productId`, `slug` y `nombre` para que cada tarjeta del catálogo abra LA
 * ficha que le corresponde. ⚠️ Mantener sincronizado con ese fixture mientras
 * I-01 siga bloqueado.
 */
const DEMO_NAMES = [
  'Zapatillas de running',
  'Polo de entrenamiento',
  'Mochila deportiva',
  'Short de running',
];

const DEMO_SPECIFICATIONS = [
  { group: 'Características', name: 'Material', value: 'Malla técnica', displayOrder: 1 },
  { group: 'Características', name: 'Peso', value: '280', unit: 'g', displayOrder: 2 },
];

export const MOCK_DEMO_PRODUCTS: ProductDetailResponseDTO[] = Array.from(
  { length: 32 },
  (_, index) => {
    const number = index + 1;
    const name = `${DEMO_NAMES[index % DEMO_NAMES.length]} ${String(number).padStart(2, '0')}`;
    return {
      data: {
        productId: `mock-product-${number}`,
        slug: `producto-demostracion-${number}`,
        name,
        brand: { brandId: 'BR-MOCK', name: 'BrandMock' },
        description: `${name} de demostración. Producto ficticio [MOCK].`,
        technicalSpecifications: DEMO_SPECIFICATIONS.map((spec) => ({ ...spec })),
        media: [
          {
            mediaId: `MED-DEMO-${number}-FRONT`,
            type: 'IMAGE',
            url: `https://placehold.co/600x400?text=${number}A`,
            alt: `${name} — vista frontal [MOCK]`,
            displayOrder: 1,
          },
          {
            mediaId: `MED-DEMO-${number}-SIDE`,
            type: 'IMAGE',
            url: `https://placehold.co/600x400?text=${number}B`,
            alt: `${name} — vista lateral [MOCK]`,
            displayOrder: 2,
          },
        ],
      },
      meta: { source: 'MOCK', retrievedAt: new Date().toISOString() },
    };
  },
);

/** Índice slug → ficha MOCK de productos conocidos (el service no tiene fallback). */
const slugEntries: Array<[string, ProductDetailResponseDTO]> =
  MOCK_DEMO_PRODUCTS.map((product) => [product.data.slug, product]);
slugEntries.push([MOCK_PRODUCT_SIMPLE.data.slug, MOCK_PRODUCT_SIMPLE]);
slugEntries.push([MOCK_PRODUCT_VARIABLE.data.slug, MOCK_PRODUCT_VARIABLE]);

export const MOCK_PRODUCTS_BY_SLUG: ReadonlyMap<string, ProductDetailResponseDTO> =
  new Map(slugEntries);
