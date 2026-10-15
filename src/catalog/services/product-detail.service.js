/**
 * Servicio BFF — Detalle de Producto (F-011)
 *
 * Responsabilidades:
 *   - En modo MOCK (H3): retornar fixture según slug recibido
 *   - En modo REAL (post I-01): llamar a Productos y Ofertas, mapear respuesta al DTO
 *
 * ⚠️ MOCK — Mientras I-01 esté bloqueado, solo se retornan fixtures.
 *
 * @see SPECS/contrato-api/F-011-detalle-producto.md
 */

const { MOCK_PRODUCT_SIMPLE, MOCK_PRODUCT_NO_SPECS } = require('../fixtures/product-detail.fixture');

/**
 * Códigos de error del contrato API F-011 v1 (§4 — API-F011-001).
 * @see SPECS/contrato-api/F-011-detalle-producto.md
 *
 * NOTA (H3 / MOCK): PRODUCT_CATALOG_INVALID_RESPONSE (502) y
 * PRODUCT_CATALOG_TIMEOUT (504) sólo son alcanzables post I-01,
 * cuando exista un upstream real de Productos y Ofertas.
 */
const ERROR_CODES = Object.freeze({
  INVALID_PRODUCT_SLUG: 'INVALID_PRODUCT_SLUG', // 400 — validado por el controlador
  PRODUCT_NOT_AVAILABLE: 'PRODUCT_NOT_AVAILABLE', // 404 — producto inactivo/no habilitado
  PRODUCT_CATALOG_INVALID_RESPONSE: 'PRODUCT_CATALOG_INVALID_RESPONSE', // 502 — contrato upstream inválido (post I-01)
  PRODUCT_CATALOG_UNAVAILABLE: 'PRODUCT_CATALOG_UNAVAILABLE', // 503 — proveedor/caché no disponible
  PRODUCT_CATALOG_TIMEOUT: 'PRODUCT_CATALOG_TIMEOUT', // 504 — timeout hacia el proveedor (post I-01)
});

/**
 * Error personalizado con código HTTP
 */
class HttpError extends Error {
  /**
   * @param {number} statusCode
   * @param {string} code
   * @param {string} message
   */
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Simula latencia de red para hacer más realista el modo MOCK.
 * @returns {Promise<void>}
 */
async function simulateLatency() {
  await new Promise((r) => setTimeout(r, 150));
}

/**
 * Obtiene el detalle de un producto por slug.
 *
 * @param {string} slug - Slug del producto (ya validado por el controlador)
 * @returns {Promise<Object>} ProductDetailResponseDTO
 * @throws {HttpError} 404 si no se encuentra, 503 si servicio no disponible
 */
async function getBySlug(slug) {
  // Modo MOCK activo mientras I-01 esté bloqueado
  const bffMode = process.env.BFF_MODE || 'mock';

  if (bffMode === 'mock') {
    await simulateLatency();

    if (slug === 'producto-no-existente-mock') {
      throw new HttpError(404, ERROR_CODES.PRODUCT_NOT_AVAILABLE, 'Producto no encontrado');
    }
    if (slug === 'producto-error-503-mock') {
      throw new HttpError(503, ERROR_CODES.PRODUCT_CATALOG_UNAVAILABLE, 'Servicio de catálogo no disponible');
    }
    if (slug === 'producto-error-504-mock') {
      throw new HttpError(504, ERROR_CODES.PRODUCT_CATALOG_TIMEOUT, 'Timeout al consultar el servicio de catálogo');
    }
    if (slug === 'producto-sin-specs-mock') {
      return {
        ...MOCK_PRODUCT_NO_SPECS,
        meta: { source: 'MOCK', retrievedAt: new Date().toISOString() },
      };
    }

    return {
      ...MOCK_PRODUCT_SIMPLE,
      meta: { source: 'MOCK', retrievedAt: new Date().toISOString() },
    };
  }

  // TODO (post I-01): llamar a Productos y Ofertas y mapear respuesta
  throw new HttpError(503, ERROR_CODES.PRODUCT_CATALOG_UNAVAILABLE, 'I-01 gate not closed — integración no disponible');
}

module.exports = {
  getBySlug,
  HttpError,
  ERROR_CODES,
};
