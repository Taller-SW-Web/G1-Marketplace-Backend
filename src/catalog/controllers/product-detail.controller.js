/**
 * Controlador BFF — Detalle de Producto (F-011)
 *
 * Endpoint: GET /api/v1/catalog/products/:slug
 *
 * Valida el slug antes de pasarlo al servicio y mapea
 * errores a los códigos HTTP correctos.
 *
 * ⚠️ MOCK — H3: respuestas provienen de fixtures.
 *
 * @see SPECS/contrato-api/F-011-detalle-producto.md
 */

const { getBySlug, HttpError, ERROR_CODES } = require('../services/product-detail.service');

// ─── Validación del slug (misma regla que el frontend) ──────────
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MAX_LENGTH = 120;

/**
 * Valida el formato de un slug de producto.
 * @param {string} slug
 * @returns {{ valid: boolean, error?: string }}
 */
function validateSlug(slug) {
  if (!slug || typeof slug !== 'string') {
    return { valid: false, error: 'El slug es requerido' };
  }
  if (slug.length > SLUG_MAX_LENGTH) {
    return { valid: false, error: `El slug excede la longitud máxima de ${SLUG_MAX_LENGTH} caracteres` };
  }
  if (!SLUG_PATTERN.test(slug)) {
    return { valid: false, error: 'El slug tiene formato inválido. Solo se permiten minúsculas, dígitos y guiones' };
  }
  return { valid: true };
}

/**
 * Ruta base del endpoint BFF de catálogo.
 */
const ROUTE_PREFIX = '/api/v1/catalog/products/';

/**
 * Verifica si la URL corresponde al endpoint de detalle de producto
 * y extrae el slug.
 *
 * @param {string} url - URL de la request (sin query params)
 * @returns {{ match: boolean, slug?: string }}
 */
function matchRoute(url) {
  // Remover query string si existe
  const path = url.split('?')[0];

  if (!path.startsWith(ROUTE_PREFIX)) {
    return { match: false };
  }

  const slug = path.slice(ROUTE_PREFIX.length);

  // No matchear si hay segmentos adicionales después del slug
  if (slug.includes('/')) {
    return { match: false };
  }

  return { match: true, slug };
}

/**
 * Origen de las respuestas del catálogo para el header `X-Catalog-Source`
 * (consumido por el proxy compartido del frontend `/api/catalog/...`).
 * MOCK mientras I-01 esté bloqueado; REAL cuando opere el adaptador.
 */
const CATALOG_SOURCE = (process.env.BFF_MODE || 'mock') === 'mock' ? 'MOCK' : 'REAL';

/**
 * Envía una respuesta JSON formateada.
 * @param {import('http').ServerResponse} res
 * @param {number} statusCode
 * @param {Object} body
 */
function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'X-Catalog-Source': CATALOG_SOURCE,
  });
  res.end(JSON.stringify(body, null, 2));
}

/**
 * Maneja la request GET /api/v1/catalog/products/:slug
 *
 * Códigos HTTP de respuesta (códigos según contrato API F-011 v1):
 *   400 — Slug inválido (formato) → INVALID_PRODUCT_SLUG
 *   404 — Producto no encontrado → PRODUCT_NOT_AVAILABLE
 *   502 — Respuesta de Productos malformada / servicio caído → PRODUCT_CATALOG_INVALID_RESPONSE
 *   503 — BFF sin disponibilidad → PRODUCT_CATALOG_UNAVAILABLE
 *   504 — Timeout hacia Productos → PRODUCT_CATALOG_TIMEOUT (post I-01)
 *
 * @see SPECS/contrato-api/F-011-detalle-producto.md
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @returns {Promise<boolean>} true si la ruta fue manejada, false si no corresponde
 */
async function handleProductDetail(req, res) {
  // Solo manejar GET
  if (req.method !== 'GET') {
    return false;
  }

  const routeMatch = matchRoute(req.url);
  if (!routeMatch.match) {
    return false;
  }

  const { slug } = routeMatch;

  // Validar slug ANTES de llamar al servicio
  const validation = validateSlug(slug);
  if (!validation.valid) {
    sendJson(res, 400, {
      error: {
        code: ERROR_CODES.INVALID_PRODUCT_SLUG,
        message: validation.error,
      },
    });
    return true;
  }

  try {
    const result = await getBySlug(slug);
    sendJson(res, 200, result);
    return true;
  } catch (error) {
    if (error instanceof HttpError) {
      // Mapear errores del servicio al código HTTP correcto
      sendJson(res, error.statusCode, {
        error: {
          code: error.code,
          message: error.message,
        },
      });
      return true;
    }

    // Error inesperado — sin exponer detalles internos (sin PII en logs)
    console.error('[BFF Catalog] Error inesperado en getBySlug');
    sendJson(res, 502, {
      error: {
        code: ERROR_CODES.PRODUCT_CATALOG_INVALID_RESPONSE,
        message: 'Error al obtener datos del catálogo',
      },
    });
    return true;
  }
}

module.exports = {
  handleProductDetail,
  matchRoute,
  validateSlug,
  ROUTE_PREFIX,
};
