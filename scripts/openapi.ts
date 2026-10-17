import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const error = (description: string, code: string) => ({ description, content: { 'application/json': {
  schema: { $ref: '#/components/schemas/ApiError' }, example: { code, message: description },
} } });
const unavailable = (...codes: string[]) => ({ description: 'Proveedor no disponible', content: { 'application/json': {
  schema: { $ref: '#/components/schemas/ApiError' }, examples: Object.fromEntries(codes.map((code) => [code, {
    value: { code, message: 'Servicio no disponible' },
  }])),
} } });
const saved = (description: string) => ({ description, content: { 'application/json': {
  schema: { $ref: '#/components/schemas/WishlistItem' }, example: { productId: 'PRD-1' },
} } });
const document = {
  openapi: '3.0.3',
  info: { title: 'Marketplace H3 — Favoritos', version: '0.2.0', description:
    'F-036–F-039 sandbox conectado: identidad, catálogo y condiciones comerciales MOCK; HTTP y persistencia PostgreSQL reales locales; agregar al carrito conserva el favorito, sin idempotencia durable. No acredita homologación externa.' },
  servers: [{ url: 'http://localhost:10000', description: 'Sandbox local, no producción' }],
  paths: {
    '/api/v1/wishlist': { get: {
      operationId: 'listWishlist', summary: 'F-037: favoritos del titular por createdAt DESC', security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Arreglo confirmado; [] solo para lista vacía. Cache-Control: no-store, private.', content: { 'application/json': {
          schema: { type: 'array', items: { $ref: '#/components/schemas/WishlistItemView' } },
          example: [{ productId: 'PRD-1', createdAt: '2026-10-16T12:00:00.000Z', name: 'Producto de prueba',
            slug: 'producto-de-prueba', brand: 'Marca sandbox', image: null, price: { amount: 89.9, currency: 'PEN' }, availability: 'AVAILABLE' }],
        } } },
        '400': error('No se admiten parámetros', 'INVALID_REQUEST'),
        '401': error('Autenticación requerida', 'UNAUTHORIZED'),
        '503': unavailable('CATALOG_UNAVAILABLE', 'AUTH_UNAVAILABLE'),
        '500': error('Error interno del servicio', 'INTERNAL_ERROR'),
      },
    } },
    '/api/v1/wishlist/items/{productId}/add-to-cart': { post: {
      operationId: 'addWishlistItemToCart', summary: 'Agregar una unidad al carrito conservando el favorito', security: [{ bearerAuth: [] }],
      description: 'Sin cuerpo ni Idempotency-Key. Cada solicitud aceptada agrega una unidad y conserva el favorito. Sin deduplicación durable ni tabla de movimientos. Ante timeout consultar carrito, sin reintentar automáticamente. No confirma reservas ni acredita F-039 original.',
      parameters: [
        { name: 'productId', in: 'path', required: true, schema: { type: 'string', minLength: 1, maxLength: 100 }, description: 'Identificador textual, no SKU; sin espacios exteriores ni controles.' },
      ],
      responses: {
        '200': { description: 'Adición confirmada; favorito conservado; Cache-Control: no-store, private.', content: { 'application/json': {
          schema: { $ref: '#/components/schemas/AddFromWishlistResult' }, example: { productId: 'PRD-1', cart: {
            cartId: '11111111-1111-4111-8111-111111111111', version: 2,
            items: [{ sku: 'SKU-SIMPLE', quantity: 1, unitPrice: { amount: 89.9, currency: 'PEN', version: 1 } }],
          } },
        } } },
        '400': { description: 'Solicitud inválida', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' }, examples: {
          invalidRequest: { value: { code: 'INVALID_REQUEST', message: 'Adición inválida' } },
          invalidProductId: { value: { code: 'INVALID_PRODUCT_ID', message: 'Identificador inválido' } },
        } } } },
        '401': error('Autenticación requerida', 'UNAUTHORIZED'),
        '404': error('Producto no disponible; favorito conservado', 'PRODUCT_NOT_AVAILABLE'),
        '409': { description: 'Conflicto; ninguna nueva mutación confirmada', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' }, examples:
          Object.fromEntries(['STOCK_LIMIT_REACHED', 'CART_CONFLICT']
            .map((code) => [code, { value: { code, message: 'Adición no confirmada' } }])),
        } } },
        '422': { description: 'Seleccionar variante; favorito conservado', content: { 'application/json': {
          schema: { $ref: '#/components/schemas/VariantSelectionError' },
          example: { code: 'VARIANT_SELECTION_REQUIRED', message: 'Selecciona una variante', redirectUrl: '/productos/producto-con-variantes' },
        } } },
        '503': { description: 'Proveedor no disponible', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' }, examples:
          Object.fromEntries(['CATALOG_UNAVAILABLE', 'COMMERCE_DATA_UNAVAILABLE', 'AUTH_UNAVAILABLE']
            .map((code) => [code, { value: { code, message: 'Servicio no disponible' } }])),
        } } },
        '500': error('Error interno del servicio', 'INTERNAL_ERROR'),
      },
    } },
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
        '503': unavailable('CATALOG_UNAVAILABLE', 'AUTH_UNAVAILABLE'),
        '500': error('Error interno del servicio', 'INTERNAL_ERROR'),
      },
    } },
    '/api/v1/wishlist/items/{productId}': { delete: {
      operationId: 'readdWishlistItemToCart', summary: 'F-038: eliminar favorito propio, sin consultar catálogo',
      security: [{ bearerAuth: [] }], parameters: [{ name: 'productId', in: 'path', required: true,
        schema: { type: 'string', minLength: 1, maxLength: 100 }, description: 'Sin espacios exteriores ni caracteres de control. Referencia textual, no SKU.' }],
      responses: { '204': { description: 'Eliminado o ya ausente; sin cuerpo' },
        '400': error('Identificador inválido', 'INVALID_PRODUCT_ID'),
        '401': error('Autenticación requerida', 'UNAUTHORIZED'),
        '503': unavailable('AUTH_UNAVAILABLE'),
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
      WishlistItemView: { type: 'object', additionalProperties: false,
        required: ['productId', 'createdAt', 'name', 'slug', 'brand', 'image', 'price', 'availability'], properties: {
          productId: { type: 'string', minLength: 1, maxLength: 100 }, createdAt: { type: 'string', format: 'date-time' },
          name: { type: 'string', nullable: true, minLength: 1 }, slug: { type: 'string', nullable: true, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
          brand: { type: 'string', nullable: true, minLength: 1 },
          image: { type: 'object', nullable: true, additionalProperties: false, required: ['url', 'alt'], properties: {
            url: { type: 'string', pattern: '^https://' }, alt: { type: 'string', minLength: 1 },
          } },
          price: { type: 'object', nullable: true, additionalProperties: false, required: ['amount', 'currency'], properties: {
            amount: { type: 'number', minimum: 0 }, currency: { type: 'string', pattern: '^[A-Z]{3}$' },
          } },
          availability: { type: 'string', enum: ['AVAILABLE', 'OUT_OF_STOCK', 'UNAVAILABLE'] },
        } },
      AddFromWishlistResult: { type: 'object', additionalProperties: false, required: ['productId', 'cart'], properties: {
        productId: { type: 'string' }, cart: { type: 'object', additionalProperties: false, required: ['cartId', 'version', 'items'], properties: {
          cartId: { type: 'string', format: 'uuid' }, version: { type: 'integer', minimum: 0 }, items: { type: 'array', items: {
            type: 'object', additionalProperties: false, required: ['sku', 'quantity'], properties: {
              sku: { type: 'string', minLength: 1 }, quantity: { type: 'integer', minimum: 1, maximum: 99 },
              unitPrice: { type: 'object', additionalProperties: false, required: ['amount', 'currency', 'version'], properties: {
                amount: { type: 'number', minimum: 0 }, currency: { type: 'string', pattern: '^[A-Z]{3}$' }, version: { type: 'integer', minimum: 0 },
              } },
            },
          } },
        } },
      } },
      VariantSelectionError: { type: 'object', additionalProperties: false, required: ['code', 'message', 'redirectUrl'], properties: {
        code: { type: 'string', enum: ['VARIANT_SELECTION_REQUIRED'] }, message: { type: 'string' },
        redirectUrl: { type: 'string', pattern: '^/productos/[a-z0-9]+(?:-[a-z0-9]+)*$' },
      } },
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
