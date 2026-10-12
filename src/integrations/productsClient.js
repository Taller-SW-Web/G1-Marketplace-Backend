/**
 * Cliente de Integración Externa: Módulo de Productos (G6)
 * Cumple con TASK-TRANS-S01-OPS-002, Gate I-01 y reglas de seguridad para H3.
 * 
 * Reglas de Seguridad implementadas:
 * 1. Timeout obligatorio para evitar cuelgues del servidor.
 * 2. Mapeo seguro de errores HTTP (401, 403, 429, 500).
 * 3. Sanitización de logs (cero exposición de tokens o datos sensibles).
 */

const BASE_URL = process.env.PRODUCTOS_BASE_URL;
const TIMEOUT_MS = parseInt(process.env.PRODUCTOS_TIMEOUT_MS || '5000', 10);

class ProductsIntegrationError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.name = 'ProductsIntegrationError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

async function requestProducts(endpoint, options = {}) {
  if (!BASE_URL) {
    throw new ProductsIntegrationError(
      'Integración I-01 no configurada: falta definir PRODUCTOS_BASE_URL en el entorno.',
      503,
      'I01_PROVIDER_URL_MISSING'
    );
  }

  const cleanBase = BASE_URL.replace(/\/+$/, '');
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const targetUrl = `${cleanBase}${cleanEndpoint}`;

  console.log(`[Integración Productos] Consultando: ${cleanEndpoint}`);

  try {
    const response = await fetch(targetUrl, {
      ...options,
      headers: {
        'Accept': 'application/json',
        ...(options.headers || {}),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      let errorCode = 'PROVIDER_ERROR';
      let safeMessage = 'Error al comunicarse con el catálogo de productos.';

      switch (response.status) {
        case 401:
          errorCode = 'PROVIDER_UNAUTHORIZED';
          safeMessage = 'Credenciales no autorizadas ante el proveedor de productos.';
          break;
        case 403:
          errorCode = 'PROVIDER_FORBIDDEN';
          safeMessage = 'Acceso denegado al recurso solicitado en productos.';
          break;
        case 429:
          errorCode = 'PROVIDER_RATE_LIMITED';
          safeMessage = 'Límite de peticiones excedido hacia el proveedor de productos.';
          break;
        case 404:
          errorCode = 'NOT_FOUND';
          safeMessage = 'El recurso solicitado no fue encontrado en el catálogo.';
          break;
      }

      console.warn(`[Integración Productos] Error HTTP ${response.status}: ${errorCode}`);
      throw new ProductsIntegrationError(safeMessage, response.status, errorCode);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof ProductsIntegrationError) {
      throw error;
    }

    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      console.error(`[Integración Productos] Timeout tras ${TIMEOUT_MS}ms`);
      throw new ProductsIntegrationError(
        'Tiempo de espera agotado al consultar el catálogo de productos.',
        504,
        'PROVIDER_TIMEOUT'
      );
    }

    console.error(`[Integración Productos] Fallo de red/conexión: ${error.message}`);
    throw new ProductsIntegrationError(
      'Fallo de conectividad al alcanzar el servicio de productos.',
      502,
      'PROVIDER_NETWORK_ERROR'
    );
  }
}

/**
 * F-006: Obtener categorías principales
 */
async function getCategories() {
  return requestProducts('/api/v1/categorias');
}

/**
 * F-007: Buscar productos por texto
 */
async function searchProducts(query, page = 1, limit = 20) {
  const params = new URLSearchParams({
    q: query,
    page: String(page),
    limit: String(limit),
  });
  return requestProducts(`/api/v1/productos?${params.toString()}`);
}

module.exports = {
  requestProducts,
  getCategories,
  searchProducts,
  ProductsIntegrationError,
};
