import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const error = (description: string, code: string) => ({
  description,
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ApiError' },
      example: { code, message: description },
    },
  },
});

const unavailable = (...codes: string[]) => ({
  description: 'Proveedor no disponible',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ApiError' },
      examples: Object.fromEntries(
        codes.map((code) => [
          code,
          {
            value: { code, message: 'Servicio no disponible' },
          },
        ]),
      ),
    },
  },
});

const saved = (description: string) => ({
  description,
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/WishlistItem' },
      example: { productId: 'PRD-1' },
    },
  },
});

const document = {
  openapi: '3.0.3',
  info: {
    title: 'Marketplace — API BFF Carrito y Favoritos (Hito 3 / Hito 4)',
    version: '0.3.0',
    description:
      'Especificación OpenAPI para las operaciones de Carrito de Compras (F-016 a F-021) y Favoritos (F-036 a F-039). Soporta autenticación dual: Bearer JWT (RS256) para clientes autenticados y cookie HttpOnly (cart_session) para invitados.',
  },
  servers: [
    { url: 'http://localhost:10000', description: 'Sandbox / Desarrollo local' },
    { url: 'https://g1-marketplace-backend.onrender.com', description: 'Servidor Render Producción' },
  ],
  paths: {
    '/api/v1/carts/current/items': {
      post: {
        operationId: 'addCartItem',
        tags: ['Cart'],
        summary: 'F-016: Agregar ítem al carrito actual (alta o incremento)',
        description:
          'Agrega 1 o más unidades de un SKU al carrito actual. Si el SKU no existe, crea la línea (201 ITEM_CREATED); si ya existe, incrementa la cantidad (200 ITEM_INCREMENTED). Se ejecuta de forma transaccional incrementando Cart.version y aplicando un lock exclusivo de PostgreSQL por titular. Ante usuario no autenticado, genera o renueva cookie Set-Cookie: cart_session=...; HttpOnly; SameSite=Lax.',
        security: [{ bearerAuth: [] }, {}],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AddCartItemPayload' },
              example: { sku: 'AERO-42-BLK', quantity: 1 },
            },
          },
        },
        responses: {
          '201': {
            description: 'Nueva línea creada en el carrito (ITEM_CREATED).',
            headers: {
              'Set-Cookie': {
                description: 'Cookie de sesión anónima HttpOnly (solo para invitados)',
                schema: { type: 'string', example: 'cart_session=uuid; Path=/; HttpOnly; SameSite=Lax' },
              },
            },
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CartMutationResponse' },
                example: {
                  status: 'ITEM_CREATED',
                  data: {
                    cartId: '11111111-1111-4111-8111-111111111111',
                    version: 2,
                    items: [
                      {
                        sku: 'AERO-42-BLK',
                        quantity: 1,
                        unitPrice: { amount: 89.9, currency: 'PEN', version: 1 },
                      },
                    ],
                  },
                },
              },
            },
          },
          '200': {
            description: 'Línea existente incrementada (ITEM_INCREMENTED).',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CartMutationResponse' },
                example: {
                  status: 'ITEM_INCREMENTED',
                  data: {
                    cartId: '11111111-1111-4111-8111-111111111111',
                    version: 3,
                    items: [
                      {
                        sku: 'AERO-42-BLK',
                        quantity: 2,
                        unitPrice: { amount: 89.9, currency: 'PEN', version: 1 },
                      },
                    ],
                  },
                },
              },
            },
          },
          '400': {
            description: 'Validación fallida: SKU ausente o cantidad fuera del rango permitido [1, 99].',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiError' },
                examples: {
                  invalidSku: { value: { code: 'INVALID_SKU', message: 'El parámetro sku es requerido.' } },
                  invalidQuantity: { value: { code: 'INVALID_QUANTITY', message: 'La cantidad debe ser un entero entre 1 y 99.' } },
                },
              },
            },
          },
          '401': error('Token de autenticación inválido, expirado o firma corrupta.', 'UNAUTHENTICATED'),
          '404': error('Producto o SKU no disponible para venta.', 'SKU_NOT_AVAILABLE'),
          '409': {
            description: 'Conflicto de negocio: límite de stock excedido o error de cotización.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiError' },
                examples: {
                  stockLimitReached: {
                    value: {
                      code: 'STOCK_LIMIT_REACHED',
                      message: 'La cantidad excede el límite permitido de 99 unidades por ítem.',
                    },
                  },
                  commerceDataUnavailable: {
                    value: {
                      code: 'COMMERCE_DATA_UNAVAILABLE',
                      message: 'Cotización no válida o datos comerciales no disponibles.',
                    },
                  },
                },
              },
            },
          },
          '500': error('Error interno del servidor.', 'INTERNAL_ERROR'),
        },
      },
    },
    '/api/v1/carts/current/items/{sku}': {
      patch: {
        operationId: 'updateCartItemQuantity',
        tags: ['Cart'],
        summary: 'F-017: Cambiar la cantidad de un ítem en el carrito',
        description:
          'Actualiza la cantidad de un SKU en el carrito actual mediante reemplazo absoluto (entero entre 1 y 99). Soporta If-Match para control de concurrencia optimista contra Cart.version. Cantidad 0 es rechazada con 400 (no eliminación implícita). Si el SKU no existe, responde 404 CART_ITEM_NOT_FOUND.',
        security: [{ bearerAuth: [] }, {}],
        parameters: [
          {
            name: 'sku',
            in: 'path',
            required: true,
            schema: { type: 'string', minLength: 1 },
            description: 'Identificador SKU del ítem a modificar.',
          },
          {
            name: 'If-Match',
            in: 'header',
            required: false,
            schema: { type: 'string' },
            description: 'Versión esperada del carrito para control de concurrencia optimista.',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['quantity'],
                additionalProperties: false,
                properties: {
                  quantity: {
                    type: 'integer',
                    minimum: 1,
                    maximum: 99,
                    description: 'Nueva cantidad absoluta del ítem (entero entre 1 y 99).',
                    example: 3,
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Cantidad actualizada exitosamente; versión del carrito incrementada.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['status', 'data'],
                  properties: {
                    status: { type: 'string', example: 'OK' },
                    data: { $ref: '#/components/schemas/CartSnapshot' },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Cantidad inválida (ej. 0, negativa o > 99).',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiError' },
                example: { code: 'INVALID_QUANTITY', message: 'La cantidad debe ser un entero entre 1 y 99. La cantidad 0 no es admitida.' },
              },
            },
          },
          '401': error('Token de autenticación inválido o expirado.', 'UNAUTHENTICATED'),
          '404': error('El ítem no existe en el carrito actual.', 'CART_ITEM_NOT_FOUND'),
          '409': {
            description: 'Conflicto de concurrencia (If-Match) o límite de stock alcanzado.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiError' },
                examples: {
                  cartConflict: { value: { code: 'CART_CONFLICT', message: 'Conflicto de versión en carrito.' } },
                  stockLimitReached: { value: { code: 'STOCK_LIMIT_REACHED', message: 'La cantidad excede el límite permitido.' } },
                },
              },
            },
          },
          '500': error('Error interno del servidor.', 'INTERNAL_ERROR'),
        },
      },
    },
    '/api/v1/carts/current': {
      get: {
        operationId: 'getCurrentCart',
        tags: ['Cart'],
        summary: 'F-019: Obtener el carrito actual del titular o invitado',
        description:
          'Recupera el snapshot del carrito activo asociado al customer_id (vía Bearer token) o a la sesión anónima (vía cookie cart_session). Devuelve items, cantidades, snapshots de precios y la versión actual.',
        security: [{ bearerAuth: [] }, {}],
        responses: {
          '200': {
            description: 'Carrito recuperado exitosamente.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['status', 'data'],
                  properties: {
                    status: { type: 'string', example: 'OK' },
                    data: { $ref: '#/components/schemas/CartSnapshot' },
                  },
                },
              },
            },
          },
          '500': error('Error interno del servidor.', 'INTERNAL_ERROR'),
        },
      },
    },
    '/api/v1/wishlist': {
      get: {
        operationId: 'listWishlist',
        tags: ['Wishlist'],
        summary: 'F-037: favoritos del titular por createdAt DESC',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Arreglo confirmado; [] solo para lista vacía. Cache-Control: no-store, private.',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/WishlistItemView' } },
                example: [
                  {
                    productId: 'PRD-1',
                    createdAt: '2026-10-16T12:00:00.000Z',
                    name: 'Producto de prueba',
                    slug: 'producto-de-prueba',
                    brand: 'Marca sandbox',
                    image: null,
                    price: { amount: 89.9, currency: 'PEN' },
                    availability: 'AVAILABLE',
                  },
                ],
              },
            },
          },
          '400': error('No se admiten parámetros', 'INVALID_REQUEST'),
          '401': error('Autenticación requerida', 'UNAUTHORIZED'),
          '503': unavailable('CATALOG_UNAVAILABLE', 'AUTH_UNAVAILABLE'),
          '500': error('Error interno del servicio', 'INTERNAL_ERROR'),
        },
      },
    },
    '/api/v1/wishlist/items/{productId}/add-to-cart': {
      post: {
        operationId: 'addWishlistItemToCart',
        tags: ['Wishlist'],
        summary: 'Agregar una unidad al carrito conservando el favorito',
        security: [{ bearerAuth: [] }],
        description:
          'Sin cuerpo ni Idempotency-Key. Cada solicitud aceptada agrega una unidad y conserva el favorito. Sin deduplicación durable ni tabla de movimientos. Ante timeout consultar carrito, sin reintentar automáticamente. No confirma reservas ni acredita F-039 original.',
        parameters: [
          {
            name: 'productId',
            in: 'path',
            required: true,
            schema: { type: 'string', minLength: 1, maxLength: 100 },
            description: 'Identificador textual, no SKU; sin espacios exteriores ni controles.',
          },
        ],
        responses: {
          '200': {
            description: 'Adición confirmada; favorito conservado; Cache-Control: no-store, private.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AddFromWishlistResult' },
                example: {
                  productId: 'PRD-1',
                  cart: {
                    cartId: '11111111-1111-4111-8111-111111111111',
                    version: 2,
                    items: [
                      {
                        sku: 'SKU-SIMPLE',
                        quantity: 1,
                        unitPrice: { amount: 89.9, currency: 'PEN', version: 1 },
                      },
                    ],
                  },
                },
              },
            },
          },
          '400': {
            description: 'Solicitud inválida',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiError' },
                examples: {
                  invalidRequest: { value: { code: 'INVALID_REQUEST', message: 'Adición inválida' } },
                  invalidProductId: { value: { code: 'INVALID_PRODUCT_ID', message: 'Identificador inválido' } },
                },
              },
            },
          },
          '401': error('Autenticación requerida', 'UNAUTHORIZED'),
          '404': error('Producto no disponible; favorito conservado', 'PRODUCT_NOT_AVAILABLE'),
          '409': {
            description: 'Conflicto; ninguna nueva mutación confirmada',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiError' },
                examples: Object.fromEntries(
                  ['STOCK_LIMIT_REACHED', 'CART_CONFLICT'].map((code) => [
                    code,
                    { value: { code, message: 'Adición no confirmada' } },
                  ]),
                ),
              },
            },
          },
          '422': {
            description: 'Seleccionar variante; favorito conservado',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/VariantSelectionError' },
                example: {
                  code: 'VARIANT_SELECTION_REQUIRED',
                  message: 'Selecciona una variante',
                  redirectUrl: '/productos/producto-con-variantes',
                },
              },
            },
          },
          '503': {
            description: 'Proveedor no disponible',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiError' },
                examples: Object.fromEntries(
                  ['CATALOG_UNAVAILABLE', 'COMMERCE_DATA_UNAVAILABLE', 'AUTH_UNAVAILABLE'].map((code) => [
                    code,
                    { value: { code, message: 'Servicio no disponible' } },
                  ]),
                ),
              },
            },
          },
          '500': error('Error interno del servicio', 'INTERNAL_ERROR'),
        },
      },
    },
    '/api/v1/wishlist/items': {
      post: {
        operationId: 'saveWishlistItem',
        tags: ['Wishlist'],
        summary: 'F-036: guardar favorito propio',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/WishlistItem' } } },
        },
        responses: {
          '201': saved('Creado'),
          '200': saved('Ya existente; no altera createdAt'),
          '400': {
            description: 'Cuerpo o producto inválido',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiError' },
                examples: {
                  invalidRequest: {
                    summary: 'Cuerpo inválido o campos adicionales',
                    value: { code: 'INVALID_REQUEST', message: 'Solicitud inválida' },
                  },
                  invalidProductId: {
                    summary: 'productId inválido',
                    value: { code: 'INVALID_PRODUCT_ID', message: 'Identificador de producto inválido' },
                  },
                },
              },
            },
          },
          '401': error('Autenticación requerida', 'UNAUTHORIZED'),
          '404': error('Producto no disponible', 'PRODUCT_NOT_AVAILABLE'),
          '503': unavailable('CATALOG_UNAVAILABLE', 'AUTH_UNAVAILABLE'),
          '500': error('Error interno del servicio', 'INTERNAL_ERROR'),
        },
      },
    },
    '/api/v1/wishlist/items/{productId}': {
      delete: {
        operationId: 'readdWishlistItemToCart',
        tags: ['Wishlist'],
        summary: 'F-038: eliminar favorito propio, sin consultar catálogo',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'productId',
            in: 'path',
            required: true,
            schema: { type: 'string', minLength: 1, maxLength: 100 },
            description: 'Sin espacios exteriores ni caracteres de control. Referencia textual, no SKU.',
          },
        ],
        responses: {
          '204': { description: 'Eliminado o ya ausente; sin cuerpo' },
          '400': error('Identificador inválido', 'INVALID_PRODUCT_ID'),
          '401': error('Autenticación requerida', 'UNAUTHORIZED'),
          '503': unavailable('AUTH_UNAVAILABLE'),
          '500': error('Error interno del servicio', 'INTERNAL_ERROR'),
        },
      },
    },
    '/health': {
      get: {
        operationId: 'readiness',
        tags: ['System'],
        security: [],
        responses: {
          '200': {
            description: 'PostgreSQL disponible',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Health' },
                example: {
                  status: 'UP',
                  service: 'g1-marketplace-backend',
                  environment: 'development',
                  database: { connected: true },
                  timestamp: '2026-10-16T12:00:00.000Z',
                },
              },
            },
          },
          '503': {
            description: 'PostgreSQL no disponible',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Health' },
                example: {
                  status: 'DOWN',
                  service: 'g1-marketplace-backend',
                  environment: 'development',
                  database: { connected: false },
                  timestamp: '2026-10-16T12:00:00.000Z',
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      AddCartItemPayload: {
        type: 'object',
        additionalProperties: false,
        required: ['sku'],
        properties: {
          sku: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
            description: 'Identificador único del SKU del producto.',
            example: 'AERO-42-BLK',
          },
          quantity: {
            type: 'integer',
            minimum: 1,
            maximum: 99,
            default: 1,
            description: 'Cantidad de unidades a sumar al carrito (entero entre 1 y 99).',
            example: 1,
          },
        },
      },
      CartMutationResponse: {
        type: 'object',
        required: ['status', 'data'],
        properties: {
          status: {
            type: 'string',
            enum: ['ITEM_CREATED', 'ITEM_INCREMENTED'],
            example: 'ITEM_CREATED',
          },
          data: { $ref: '#/components/schemas/CartSnapshot' },
        },
      },
      CartSnapshot: {
        type: 'object',
        additionalProperties: false,
        required: ['cartId', 'version', 'items'],
        properties: {
          cartId: {
            type: 'string',
            format: 'uuid',
            nullable: true,
            description: 'Identificador único UUID del carrito.',
            example: '11111111-1111-4111-8111-111111111111',
          },
          version: {
            type: 'integer',
            minimum: 0,
            description: 'Versión incremental del carrito para control de concurrencia optimista.',
            example: 2,
          },
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/CartItemSnapshot' },
          },
        },
      },
      CartItemSnapshot: {
        type: 'object',
        additionalProperties: false,
        required: ['sku', 'quantity'],
        properties: {
          sku: { type: 'string', example: 'AERO-42-BLK' },
          quantity: { type: 'integer', minimum: 1, maximum: 99, example: 1 },
          unitPrice: {
            type: 'object',
            additionalProperties: false,
            required: ['amount', 'currency', 'version'],
            properties: {
              amount: { type: 'number', minimum: 0, example: 89.9 },
              currency: { type: 'string', pattern: '^[A-Z]{3}$', example: 'PEN' },
              version: { type: 'integer', minimum: 0, example: 1 },
            },
          },
        },
      },
      WishlistItemView: {
        type: 'object',
        additionalProperties: false,
        required: ['productId', 'createdAt', 'name', 'slug', 'brand', 'image', 'price', 'availability'],
        properties: {
          productId: { type: 'string', minLength: 1, maxLength: 100 },
          createdAt: { type: 'string', format: 'date-time' },
          name: { type: 'string', nullable: true, minLength: 1 },
          slug: { type: 'string', nullable: true, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
          brand: { type: 'string', nullable: true, minLength: 1 },
          image: {
            type: 'object',
            nullable: true,
            additionalProperties: false,
            required: ['url', 'alt'],
            properties: {
              url: { type: 'string', pattern: '^https://' },
              alt: { type: 'string', minLength: 1 },
            },
          },
          price: {
            type: 'object',
            nullable: true,
            additionalProperties: false,
            required: ['amount', 'currency'],
            properties: {
              amount: { type: 'number', minimum: 0 },
              currency: { type: 'string', pattern: '^[A-Z]{3}$' },
            },
          },
          availability: { type: 'string', enum: ['AVAILABLE', 'OUT_OF_STOCK', 'UNAVAILABLE'] },
        },
      },
      AddFromWishlistResult: {
        type: 'object',
        additionalProperties: false,
        required: ['productId', 'cart'],
        properties: {
          productId: { type: 'string' },
          cart: { $ref: '#/components/schemas/CartSnapshot' },
        },
      },
      VariantSelectionError: {
        type: 'object',
        additionalProperties: false,
        required: ['code', 'message', 'redirectUrl'],
        properties: {
          code: { type: 'string', enum: ['VARIANT_SELECTION_REQUIRED'] },
          message: { type: 'string' },
          redirectUrl: { type: 'string', pattern: '^/productos/[a-z0-9]+(?:-[a-z0-9]+)*$' },
        },
      },
      WishlistItem: {
        type: 'object',
        additionalProperties: false,
        required: ['productId'],
        properties: {
          productId: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
            example: 'PRD-1',
            description: 'Sin espacios exteriores ni caracteres de control; conserva capitalización.',
          },
        },
      },
      ApiError: {
        type: 'object',
        additionalProperties: false,
        required: ['code', 'message'],
        properties: { code: { type: 'string' }, message: { type: 'string' } },
      },
      Health: {
        type: 'object',
        additionalProperties: false,
        required: ['status', 'service', 'environment', 'database', 'timestamp'],
        properties: {
          status: { type: 'string', enum: ['UP', 'DOWN'] },
          service: { type: 'string', example: 'g1-marketplace-backend' },
          environment: { type: 'string', example: 'development' },
          database: {
            type: 'object',
            additionalProperties: false,
            required: ['connected'],
            properties: { connected: { type: 'boolean' } },
          },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
};

mkdirSync(resolve('docs/contratos'), { recursive: true });
writeFileSync(resolve('docs/contratos/openapi-h3.json'), `${JSON.stringify(document, null, 2)}\n`);
console.log('Generated docs/contratos/openapi-h3.json from versioned H3/H4 contract with Cart and Wishlist');
