import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Manifest = {
  repository: string;
  commit: string;
  repositoryPath: string;
  gitBlob: string;
  version: string;
  sourceUrl: string;
  sourceSha256: string;
  snapshot: string;
  snapshotSha256: string;
};

type OpenApiExtract = {
  openapi: string;
  info: { version: string };
  paths: Record<string, Record<string, any>>;
  components: {
    parameters: Record<string, any>;
    schemas: Record<string, any>;
  };
};

const fixtureDirectory = join(__dirname, '../docs/contratos/fixtures/g6-pinned');
const manifest = JSON.parse(
  readFileSync(join(fixtureDirectory, 'manifest.json'), 'utf8'),
) as Manifest;

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

function hashSnapshot(text: string): string {
  return createHash('sha256')
    .update(normalizeLineEndings(text), 'utf8')
    .digest('hex')
    .toUpperCase();
}

const snapshotText = normalizeLineEndings(
  readFileSync(join(fixtureDirectory, manifest.snapshot), 'utf8'),
);
const snapshotSha256 = hashSnapshot(snapshotText);
const contract = JSON.parse(snapshotText) as OpenApiExtract;

function findForbiddenKeys(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findForbiddenKeys(item, `${path}[${index}]`));
  }
  if (!value || typeof value !== 'object') return [];

  return Object.entries(value).flatMap(([key, child]) => {
    const childPath = path ? `${path}.${key}` : key;
    if (['servers', 'example', 'examples'].includes(key)) return [childPath];
    return findForbiddenKeys(child, childPath);
  });
}

function operation(path: string, method = 'get'): Record<string, any> {
  const found = contract.paths[path]?.[method];
  expect(found).toBeDefined();
  return found;
}

function responseSchema(path: string, name: string): Record<string, any> {
  const responseRef = operation(path).responses?.['200']?.content?.['application/json']?.schema?.$ref;
  expect(responseRef).toBe(`#/components/schemas/${name}`);
  return contract.components.schemas[name] ?? (() => {
    throw new Error(`Missing pinned schema ${name} for ${path}`);
  })();
}

describe('G6 pinned OpenAPI surface — offline extract, not provider compatibility', () => {
  it('pins provenance, commit, source blob, contract version, and the exact local extract hash', () => {
    expect(manifest.repository).toBe('Taller-SW-Web/G6-Productos-Ofertas-docs');
    expect(manifest.commit).toBe('40524e96c6973f84d74160076781702fe2a3da19');
    expect(manifest.repositoryPath).toBe('contratos/http/openapi.yaml');
    expect(manifest.gitBlob).toBe('e094988f0f0d92a7a4241c1dc30a5e50d9ff709a');
    expect(manifest.sourceUrl).toContain(`/${manifest.commit}/`);
    expect(manifest.version).toBe('0.7.0-rc.3');
    expect(manifest.sourceSha256).toBe('E66FBBC2D6837F609EB847BE973567FF3E1199A9F638A904162AD154CB691A05');
    expect(contract.openapi).toBe('3.1.0');
    expect(contract.info.version).toBe(manifest.version);
    expect(snapshotSha256).toBe(manifest.snapshotSha256);
    expect(hashSnapshot(snapshotText.replace(/\n/g, '\r\n'))).toBe(manifest.snapshotSha256);
  });

  it('contains no upstream servers or example payloads', () => {
    expect(findForbiddenKeys(contract)).toEqual([]);
  });

  it('pins the public catalog list, detail, paging, filters, and documented response statuses', () => {
    const list = operation('/productos');
    expect(list.operationId).toBe('listarProductos');
    expect(list['x-required-scope']).toBe('catalogo:leer');
    expect(list['x-service-audience']).toBe('api-productos');
    expect(list['x-scope-registration-status']).toBe('pending-security-registration');
    expect(list.responses).toHaveProperty('200');
    expect(Object.keys(list.responses)).toEqual(
      expect.arrayContaining(['400', '401', '403', '422', '429', '500', '503']),
    );
    const listParams = Object.fromEntries(list.parameters
      .filter((parameter: any) => parameter.in === 'query')
      .map((parameter: any) => [parameter.name, parameter.schema]));
    expect(listParams.pagina).toMatchObject({ type: 'integer', minimum: 1, default: 1 });
    expect(listParams.tamanio).toMatchObject({ type: 'integer', minimum: 1, maximum: 100 });
    expect(listParams).toHaveProperty('categoriaId');
    expect(listParams).toHaveProperty('marcaId');
    expect(listParams.estado).toEqual({ $ref: '#/components/schemas/EstadoProducto' });
    expect(listParams.orden).toEqual({ $ref: '#/components/schemas/OrdenCatalogo' });
    expect(responseSchema('/productos', 'PaginaProductosComercial').required).toEqual([
      'items', 'pagina', 'tamanio', 'total',
    ]);

    const detail = operation('/productos/{productoId}');
    expect(detail.operationId).toBe('obtenerProducto');
    expect(detail['x-scope-registration-status']).toBe('pending-security-registration');
    expect(detail.parameters).toContainEqual(expect.objectContaining({
      name: 'productoId', in: 'path', required: true,
    }));
    expect(Object.keys(detail.responses)).toEqual(
      expect.arrayContaining(['200', '400', '401', '403', '404', '429', '500', '503']),
    );
    const detailSchema = responseSchema('/productos/{productoId}', 'ProductoDetalleComercial');
    expect(detailSchema.allOf[0].$ref).toBe('#/components/schemas/ProductoResumenComercial');
    expect(detailSchema.allOf[1].required).toEqual(['marca', 'variants']);
    expect(responseSchema('/productos/por-slug/{slug}', 'ProductoDetalleComercial').allOf[1].required)
      .toEqual(['marca', 'variants']);
    expect(operation('/productos/por-slug/{slug}').parameters).toContainEqual(expect.objectContaining({
      name: 'canal', in: 'query', required: true,
    }));
    expect(contract.components.schemas.ProductoResumenComercial.required)
      .toEqual(expect.arrayContaining(['product_id', 'slug', 'name', 'categoria_id', 'tipo_producto_id', 'marca_id']));
  });

  it('pins the G6 SKU-price response shape and authorization errors', () => {
    const price = operation('/precios/skus/{sku}');
    expect(price.operationId).toBe('obtenerPrecioSku');
    expect(price['x-required-scope']).toBe('precios:leer');
    expect(price['x-scope-registration-status']).toBe('pending-security-registration');
    expect(price['x-status']).toBe('stable');
    expect(price.parameters).toContainEqual(expect.objectContaining({
      name: 'sku', in: 'path', required: true,
    }));
    expect(price.responses).toHaveProperty('200');
    expect(Object.keys(price.responses)).toEqual(
      expect.arrayContaining(['400', '401', '403', '404', '429', '500', '503']),
    );
    const schema = responseSchema('/precios/skus/{sku}', 'Precio');
    expect(schema.required).toEqual(expect.arrayContaining([
      'sku', 'precio_regular', 'currency', 'valid_from', 'price_version', 'vigencia_id',
    ]));
    expect(schema.properties.precio_regular).toMatchObject({ type: 'number', exclusiveMinimum: 0 });
  });

  it('pins commercial availability states without internal balances or locations', () => {
    const availability = operation('/inventario/disponibilidad/comercial');
    expect(availability.operationId).toBe('consultarDisponibilidadComercial');
    expect(availability['x-status']).toBe('provisional');
    expect(availability['x-required-scope']).toBe('inventario:disponibilidad:leer');
    expect(availability['x-scope-registration-status']).toBe('pending-security-registration');
    expect(availability.parameters).toContainEqual(expect.objectContaining({
      name: 'skus', required: true, schema: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 100 },
    }));
    expect(availability.parameters).toContainEqual(expect.objectContaining({
      name: 'canal', required: true,
    }));
    expect(Object.keys(availability.responses)).toEqual(
      expect.arrayContaining(['200', '400', '401', '403', '429', '500', '503']),
    );
    const responseSchemaForAvailability = responseSchema(
      '/inventario/disponibilidad/comercial',
      'ConsultaDisponibilidadComercialResponse',
    );
    expect(responseSchemaForAvailability.properties.items.items.$ref)
      .toBe('#/components/schemas/DisponibilidadComercial');
    const item = contract.components.schemas.DisponibilidadComercial;
    expect(item.properties.status.enum).toEqual([
      'DISPONIBLE', 'STOCK_BAJO', 'AGOTADO', 'INDETERMINADO',
    ]);
    expect(item.additionalProperties).toBe(false);
    expect(Object.keys(item.properties)).toEqual(['sku', 'status']);
  });

  it('records correlation header format without carrying real identifiers', () => {
    expect(contract.components.parameters.CorrelationId).toMatchObject({
      name: 'X-Correlation-Id',
      in: 'header',
      required: false,
      schema: { type: 'string', format: 'uuid' },
    });
  });
});
