import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const error = (description: string, code: string) => ({ description, content: { 'application/json': {
  schema: { $ref: '#/components/schemas/ApiError' }, example: { code, message: description },
} } });
const saved = (description: string) => ({ description, content: { 'application/json': {
  schema: { $ref: '#/components/schemas/WishlistItem' }, example: { productId: 'PRD-1' },
} } });
const document = {
  openapi: '3.0.3',
  info: { title: 'Marketplace H3 — Favoritos', version: '0.1.0', description:
    'Corte local de Diego. Identidad/elegibilidad MOCK, PostgreSQL real local. Sin integración Seguridad/Productos homologada. No hay GET de favoritos.' },
  servers: [{ url: 'http://localhost:10000', description: 'Sandbox local, no producción' }],
  paths: {
    '/api/v1/wishlist/items': { post: {
      operationId: 'saveWishlistItem', summary: 'F-036: guardar favorito propio', security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/WishlistItem' } } } },
      responses: {
        '201': saved('Creado'), '200': saved('Ya existente; no altera createdAt'),
        '400': { description: 'Cuerpo o producto inválido', content: { 'application/json': {
          schema: { $ref: '#/components/schemas/ApiError' }, examples: {
            invalidRequest: { summary: 'Cuerpo inválido o campos adicionales', value: {
              code: 'INVALID_REQUEST', message: 'Solicitud inválida',
            } },
            invalidProductId: { summary: 'productId inválido', value: {
              code: 'INVALID_PRODUCT_ID', message: 'Identificador de producto inválido',
            } },
          },
        } } },
        '401': error('Autenticación requerida', 'UNAUTHORIZED'),
        '404': error('Producto no disponible', 'PRODUCT_NOT_AVAILABLE'),
        '503': error('Catálogo no disponible', 'CATALOG_UNAVAILABLE'),
        '500': error('Error interno del servicio', 'INTERNAL_ERROR'),
      },
    } },
    '/api/v1/wishlist/items/{productId}': { delete: {
      operationId: 'removeWishlistItem', summary: 'F-038: eliminar favorito propio, sin consultar catálogo',
      security: [{ bearerAuth: [] }], parameters: [{ name: 'productId', in: 'path', required: true,
        schema: { type: 'string', minLength: 1, maxLength: 100 }, description: 'Sin espacios exteriores ni caracteres de control. Referencia textual, no SKU.' }],
      responses: { '204': { description: 'Eliminado o ya ausente; sin cuerpo' },
        '400': error('Identificador inválido', 'INVALID_PRODUCT_ID'),
        '401': error('Autenticación requerida', 'UNAUTHORIZED'),
        '500': error('Error interno del servicio', 'INTERNAL_ERROR') },
    } },
    '/health': { get: { operationId: 'readiness', security: [], responses: {
      '200': { description: 'PostgreSQL disponible', content: { 'application/json': { schema: { $ref: '#/components/schemas/Health' }, example: { status: 'UP', service: 'g1-marketplace-backend', environment: 'development', database: { connected: true }, timestamp: '2026-10-16T12:00:00.000Z' } } } },
      '503': { description: 'PostgreSQL no disponible', content: { 'application/json': { schema: { $ref: '#/components/schemas/Health' }, example: { status: 'DOWN', service: 'g1-marketplace-backend', environment: 'development', database: { connected: false }, timestamp: '2026-10-16T12:00:00.000Z' } } } },
    } } },
  },
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      WishlistItem: { type: 'object', additionalProperties: false, required: ['productId'], properties: {
        productId: { type: 'string', minLength: 1, maxLength: 100, example: 'PRD-1', description: 'Sin espacios exteriores ni caracteres de control; conserva capitalización.' },
      } },
      ApiError: { type: 'object', additionalProperties: false, required: ['code', 'message'], properties: { code: { type: 'string' }, message: { type: 'string' } } },
      Health: { type: 'object', additionalProperties: false,
        required: ['status', 'service', 'environment', 'database', 'timestamp'], properties: {
          status: { type: 'string', enum: ['UP', 'DOWN'] },
          service: { type: 'string', example: 'g1-marketplace-backend' },
          environment: { type: 'string', example: 'development' },
          database: { type: 'object', additionalProperties: false, required: ['connected'],
            properties: { connected: { type: 'boolean' } } },
          timestamp: { type: 'string', format: 'date-time' },
        } },
    },
  },
};

mkdirSync(resolve('docs/contratos'), { recursive: true });
writeFileSync(resolve('docs/contratos/openapi-h3.json'), `${JSON.stringify(document, null, 2)}\n`);
console.log('Generated docs/contratos/openapi-h3.json from versioned H3 contract');
