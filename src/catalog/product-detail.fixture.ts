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

// ─────────────────────────────────────────────────────────────
// Slugs especiales para pruebas (espejo del adapter FE):
//   'producto-no-existente-mock'  → responde 404
//   'producto-error-503-mock'     → responde 503
//   'producto-error-504-mock'     → responde 504
//   'producto-sin-specs-mock'     → specs vacías
// ─────────────────────────────────────────────────────────────
