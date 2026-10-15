/**
 * Tests — Endpoint BFF Detalle de Producto (F-011)
 *
 * Pruebas obligatorias de H3 (Backend):
 *   RC-F-011-BE-01 — Slug inválido retorna 400
 *   RC-F-011-BE-02 — Producto MOCK encontrado retorna 200
 *   RC-F-011-BE-03 — Slug de producto inexistente retorna 404
 *   RC-F-011-BE-04 — Slug de error de servicio retorna 503
 *   RC-F-011-BE-05 — Respuesta no contiene campos comerciales
 *
 * ⚠️ MOCK — Estos tests validan el modo MOCK (H3, I-01 bloqueado).
 *
 * @see SPECS/contrato-api/F-011-detalle-producto.md — API-CA-F011-01..05
 */

const http = require('http');
const { handleProductDetail } = require('../../src/catalog/controllers/product-detail.controller');

// Configurar modo MOCK para tests
process.env.BFF_MODE = 'mock';

let server;
let baseUrl;

beforeAll((done) => {
  server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    const handled = await handleProductDetail(req, res);
    if (!handled) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Ruta no encontrada' }));
    }
  });

  server.listen(0, () => {
    const { port } = server.address();
    baseUrl = `http://localhost:${port}`;
    done();
  });
});

afterAll((done) => {
  server.close(done);
});

/**
 * Helper para hacer requests HTTP simples sin dependencia de supertest
 * (alternativa ligera para http nativo)
 */
function httpGet(path) {
  return new Promise((resolve, reject) => {
    const url = `${baseUrl}${path}`;
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            body: JSON.parse(data),
          });
        } catch {
          resolve({
            statusCode: res.statusCode,
            body: data,
          });
        }
      });
    }).on('error', reject);
  });
}

// ─── RC-F-011-BE-01: Slug inválido retorna 400 ──────────────
describe('RC-F-011-BE-01 — Slug inválido retorna 400', () => {
  test('retorna 400 cuando el slug tiene formato inválido (mayúsculas)', async () => {
    const res = await httpGet('/api/v1/catalog/products/SLUG_INVALIDO!');
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('INVALID_PRODUCT_SLUG');
  });

  test('retorna 400 cuando el slug tiene caracteres especiales', async () => {
    const res = await httpGet('/api/v1/catalog/products/slug@invalido');
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('retorna 400 cuando el slug está vacío', async () => {
    const res = await httpGet('/api/v1/catalog/products/');
    // El slug vacío es capturado por la validación y retorna 400
    expect(res.statusCode).toBe(400);
  });

  test('retorna 400 cuando el slug excede 120 caracteres', async () => {
    const longSlug = 'a'.repeat(121);
    const res = await httpGet(`/api/v1/catalog/products/${longSlug}`);
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PRODUCT_SLUG');
  });
});

// ─── RC-F-011-BE-02: Producto MOCK encontrado retorna 200 ───
describe('RC-F-011-BE-02 — Producto MOCK encontrado retorna 200', () => {
  test('retorna 200 con datos MOCK para slug válido', async () => {
    const res = await httpGet('/api/v1/catalog/products/zapatillas-running-aero-x');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.productId).toBe('PRD-MOCK-001');
    expect(res.body.meta.source).toBe('MOCK');
  });

  test('la respuesta tiene la estructura correcta del DTO', async () => {
    const res = await httpGet('/api/v1/catalog/products/zapatillas-running-aero-x');
    expect(res.statusCode).toBe(200);

    const { data, meta } = res.body;

    // Verificar campos obligatorios de ProductDetailDTO
    expect(data.productId).toBeDefined();
    expect(data.slug).toBeDefined();
    expect(data.name).toBeDefined();
    expect(data.brand).toBeDefined();
    expect(data.brand.brandId).toBeDefined();
    expect(data.brand.name).toBeDefined();
    expect(data.technicalSpecifications).toBeDefined();
    expect(Array.isArray(data.technicalSpecifications)).toBe(true);
    expect(data.media).toBeDefined();
    expect(Array.isArray(data.media)).toBe(true);
    expect(data.media.length).toBeGreaterThan(0);

    // Verificar meta
    expect(meta.source).toBe('MOCK');
    expect(meta.retrievedAt).toBeDefined();
  });
});

// ─── RC-F-011-BE-03: Slug de producto inexistente retorna 404 ─
describe('RC-F-011-BE-03 — Slug de producto inexistente retorna 404', () => {
  test('retorna 404 para slug de producto no existente', async () => {
    const res = await httpGet('/api/v1/catalog/products/producto-no-existente-mock');
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('PRODUCT_NOT_AVAILABLE');
  });
});

// ─── RC-F-011-BE-04: Slug de error de servicio retorna 503 ───
describe('RC-F-011-BE-04 — Slug de error de servicio retorna 503', () => {
  test('retorna 503 cuando el servicio de catálogo no está disponible', async () => {
    const res = await httpGet('/api/v1/catalog/products/producto-error-503-mock');
    expect(res.statusCode).toBe(503);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('PRODUCT_CATALOG_UNAVAILABLE');
  });
});

// ─── RC-F-011-BE-05: Respuesta no contiene campos comerciales ─
describe('RC-F-011-BE-05 — Respuesta no contiene campos comerciales', () => {
  test('no incluye precio, stock ni variantes en la respuesta MOCK', async () => {
    const res = await httpGet('/api/v1/catalog/products/zapatillas-running-aero-x');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.price).toBeUndefined();
    expect(res.body.data.stock).toBeUndefined();
    expect(res.body.data.variants).toBeUndefined();
  });
});

// ─── Tests adicionales de validación ──────────────────────────
describe('Tests adicionales', () => {
  test('producto sin specs retorna array vacío de technicalSpecifications', async () => {
    const res = await httpGet('/api/v1/catalog/products/producto-sin-specs-mock');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.technicalSpecifications).toEqual([]);
    expect(res.body.meta.source).toBe('MOCK');
  });

  test('producto con error de timeout retorna 504 PRODUCT_CATALOG_TIMEOUT', async () => {
    const res = await httpGet('/api/v1/catalog/products/producto-error-504-mock');
    expect(res.statusCode).toBe(504);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('PRODUCT_CATALOG_TIMEOUT');
  });

  test('las respuestas incluyen el header X-Catalog-Source: MOCK', async () => {
    const res = await httpGet('/api/v1/catalog/products/zapatillas-running-aero-x');
    expect(res.statusCode).toBe(200);
    // httpGet no expone headers crudos; validar vía request directa
    const headerValue = await new Promise((resolve, reject) => {
      http.get(`${baseUrl}/api/v1/catalog/products/zapatillas-running-aero-x`, (r) => {
        resolve(r.headers['x-catalog-source']);
        r.resume();
      }).on('error', reject);
    });
    expect(headerValue).toBe('MOCK');
  });

  test('slug válido con guiones funciona correctamente', async () => {
    const res = await httpGet('/api/v1/catalog/products/un-slug-valido-123');
    expect(res.statusCode).toBe(200);
  });
});
