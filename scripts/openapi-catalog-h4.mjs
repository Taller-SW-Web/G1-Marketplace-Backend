import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ref = name => ({ $ref: '#/components/schemas/' + name });
const text = { type: 'string', minLength: 1 };
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const array = schema => ({ type: 'array', items: schema });
const headers = {
  'Cache-Control': { schema: { type: 'string', const: 'no-store' } },
  'X-Catalog-Source': { schema: { type: 'string', enum: ['MOCK', 'REAL', 'UNCONFIGURED'] } },
  'X-Request-Id': { schema: text },
};
const reply = (name, description) => ({ description, headers, content: { 'application/json': { schema: ref(name) } } });
const failure = description => ({ description, headers, content: { 'application/problem+json': { schema: ref('Problem') } } });
const get = (operationId, schema, parameters = []) => ({ operationId, tags: ['Catalog'], security: [], parameters,
  responses: { 200: reply(schema, 'Lectura pública válida; arreglos vacíos permitidos'), 400: failure('Criterios inválidos antes del proveedor'),
    503: failure('CATALOG_TIMEOUT: presupuesto de espera agotado; CATALOG_UNAVAILABLE: otro fallo. Sin fallback MOCK') } });
const parameter = (name, schema, description) => ({ name, in: 'query', required: false, schema, description });
const document = {
  openapi: '3.1.0',
  info: { title: 'Marketplace — Catálogo H4 (F-006–F-010)', version: '0.2.0',
    description: 'Contrato G1 implementado para revisión. Catálogo público; identidad técnica G1→G6 sólo en servidor. No acredita homologación ni despliegue.' },
  servers: [{ url: '/', description: 'Origen del BFF desplegado o local' }],
  paths: {
    '/api/v1/catalog/home': { get: get('catalogHome', 'Home') },
    '/api/v1/catalog/filters': { get: get('catalogFilters', 'Filters') },
    '/api/v1/catalog/products': { get: get('catalogProducts', 'CatalogPage', [
      parameter('q', { anyOf: [{ type: 'string', const: '' }, { type: 'string', minLength: 2, maxLength: 120 }] }, 'Normalizada: trim y espacios consecutivos; vacía significa catálogo'),
      parameter('categoryIds', { type: 'string', minLength: 1, maxLength: 120 }, 'Un ID activo, no CSV. Mapea a categoriaId G6'),
      parameter('brandIds', { type: 'string', minLength: 1, maxLength: 120 }, 'Un ID activo, no CSV. AND con categoría; mapea a marcaId'),
      parameter('minPrice', { type: 'number', minimum: 0, maximum: 9999999999999.99, multipleOf: 0.01 }, 'PEN; sin notación exponencial; precioMin G6'),
      parameter('maxPrice', { type: 'number', minimum: 0, maximum: 9999999999999.99, multipleOf: 0.01 }, 'PEN; mínimo ≤ máximo; precioMax G6'),
      parameter('sort', { type: 'string', enum: ['NAME_ASC', 'NAME_DESC'] }, 'NOMBRE_ASC/DESC G6; no ordenar una página incompleta localmente'),
      parameter('page', { type: 'integer', minimum: 0, maximum: 1000000, default: 0 }, 'Cero basada; G6 pagina=page+1. Fuera de total conserva vacío sin retry automático'),
      parameter('pageSize', { type: 'integer', minimum: 1, maximum: 48, default: 24 }, 'tamanio G6'),
    ]) },
  },
  components: { schemas: {
    Category: object({ categoryId: text, name: text }),
    Brand: object({ brandId: text, name: text }),
    ProductCard: object({ productId: text, slug: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', maxLength: 120 }, name: text,
      categoryId: text, brandId: text, image: { anyOf: [{ type: 'null' }, object({ url: text, alt: text })] } }),
    Home: object({ categories: array(ref('Category')), featuredProducts: array(ref('ProductCard')) }),
    Filters: object({ categories: array(ref('Category')), brands: array(ref('Brand')) }),
    CatalogPage: object({ sort: { type: ['string', 'null'], enum: ['NAME_ASC', 'NAME_DESC', null], description: 'Orden explícito delegado a G6; null conserva el orden predeterminado del proveedor. No acredita desempate global externo.' }, data: array(ref('ProductCard')), page: object({ number: { type: 'integer', minimum: 0 },
      size: { type: 'integer', minimum: 1, maximum: 48 }, totalElements: { type: 'integer', minimum: 0 }, totalPages: { type: 'integer', minimum: 0 } }) }),
    Problem: object({ type: text, title: text, status: { type: 'integer' }, code: { type: 'string', enum: [
      'INVALID_SEARCH_QUERY', 'INVALID_PAGE', 'INVALID_PARAMETERS', 'INVALID_FILTER', 'INVALID_PRICE_RANGE', 'INVALID_SORT', 'CATALOG_UNAVAILABLE', 'CATALOG_TIMEOUT',
    ] }, requestId: text }),
  } },
};
const target = new URL('../docs/contratos/openapi-catalogo-h4.json', import.meta.url);
mkdirSync(fileURLToPath(new URL('.', target)), { recursive: true });
writeFileSync(target, JSON.stringify(document, null, 2) + '\n');
console.log('Generated docs/contratos/openapi-catalogo-h4.json');
