import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';

type PinnedManifest = {
  repository: string;
  commit: string;
  path: string;
  gitBlob: string;
  version: string;
  snapshot: string;
  snapshotSha256: string;
};

type OpenApiDocument = {
  openapi: string;
  info: { version: string };
  servers?: Array<{ url: string }>;
  paths: Record<string, Record<string, any>>;
  components: { schemas: Record<string, any> };
};

const fixtureDirectory = join(__dirname, '../docs/contratos/fixtures/g6-pinned');
const manifest = JSON.parse(
  readFileSync(join(fixtureDirectory, 'manifest.json'), 'utf8'),
) as PinnedManifest;
const normalizeLineEndings = (source: string): string => source.replace(/\r\n/g, '\n');
const snapshotSource = normalizeLineEndings(
  readFileSync(join(fixtureDirectory, manifest.snapshot), 'utf8'),
);
const document = load(snapshotSource) as OpenApiDocument;

describe('G6 pinned OpenAPI 0.7.0-rc.3 surface', () => {
  it('pins the source provenance and the exact snapshot hash', () => {
    expect(manifest.repository).toBe('Taller-SW-Web/G6-Productos-Ofertas-docs');
    expect(manifest.commit).toBe('40524e96c6973f84d74160076781702fe2a3da19');
    expect(manifest.path).toBe('contratos/http/openapi.yaml');
    expect(manifest.gitBlob).toBe('e094988f0f0d92a7a4241c1dc30a5e50d9ff709a');
    expect(manifest.version).toBe('0.7.0-rc.3');
    expect(
      createHash('sha256').update(snapshotSource).digest('hex').toUpperCase(),
    ).toBe(manifest.snapshotSha256);
    expect(document.openapi).toBe('3.1.0');
    expect(document.info.version).toBe('0.7.0-rc.3');
    expect(document.servers).toContainEqual(
      expect.objectContaining({ url: '/api/v1' }),
    );
  });

  it('covers catalog list, detail by id and detail by slug', () => {
    expect(document.paths['/productos'].get.operationId).toBe('listarProductos');
    expect(document.paths['/productos'].get['x-required-scope']).toBe('catalogo:leer');
    expect(document.paths['/productos/{productoId}'].get.operationId).toBe(
      'obtenerProducto',
    );
    expect(document.paths['/productos/{productoId}'].get['x-required-scope']).toBe(
      'catalogo:leer',
    );
    expect(document.paths['/productos/por-slug/{slug}'].get.operationId).toBe(
      'obtenerProductoPorSlug',
    );
    expect(document.paths['/productos/por-slug/{slug}'].get['x-required-scope']).toBe(
      'catalogo:leer',
    );
    for (const path of [
      '/productos',
      '/productos/{productoId}',
      '/productos/por-slug/{slug}',
    ]) {
      expect(document.paths[path].get.responses).toHaveProperty('200');
      expect(document.paths[path].get.responses).toHaveProperty('401');
      expect(document.paths[path].get.responses).toHaveProperty('403');
    }
  });

  it('covers price and commercial availability with their documented status', () => {
    const price = document.paths['/precios/skus/{sku}'].get;
    const availability =
      document.paths['/inventario/disponibilidad/comercial'].get;

    expect(price.operationId).toBe('obtenerPrecioSku');
    expect(price['x-required-scope']).toBe('precios:leer');
    expect(price['x-status']).toBe('stable');
    expect(price.responses).toHaveProperty('200');
    expect(price.responses).toHaveProperty('404');

    expect(availability.operationId).toBe('consultarDisponibilidadComercial');
    expect(availability['x-required-scope']).toBe(
      'inventario:disponibilidad:leer',
    );
    expect(availability['x-status']).toBe('provisional');
    expect(availability.responses).toHaveProperty('200');
    expect(availability.responses).toHaveProperty('503');
  });

  it('covers POST /promociones/evaluar request and response contract', () => {
    const operation = document.paths['/promociones/evaluar'].post;

    expect(operation.operationId).toBe('evaluarPromociones');
    expect(operation['x-required-scope']).toBe('promociones:evaluar');
    expect(operation['x-scope-registration-status']).toBe(
      'pending-security-registration',
    );
    expect(
      operation.requestBody.content['application/json'].schema.$ref,
    ).toBe('#/components/schemas/EvaluacionPromocionesRequest');
    expect(
      operation.responses['200'].content['application/json'].schema.$ref,
    ).toBe('#/components/schemas/EvaluacionPromocionesResponse');
    expect(document.components.schemas).toHaveProperty(
      'EvaluacionPromocionesRequest',
    );
    expect(document.components.schemas).toHaveProperty(
      'EvaluacionPromocionesResponse',
    );
    for (const status of ['200', '400', '401', '403', '422', '429', '500', '503']) {
      expect(operation.responses).toHaveProperty(status);
    }
  });

  it('keeps every required operation marked as pending security registration', () => {
    const operations = [
      document.paths['/productos'].get,
      document.paths['/productos/{productoId}'].get,
      document.paths['/productos/por-slug/{slug}'].get,
      document.paths['/precios/skus/{sku}'].get,
      document.paths['/inventario/disponibilidad/comercial'].get,
      document.paths['/promociones/evaluar'].post,
    ];

    for (const operation of operations) {
      expect(operation['x-scope-registration-status']).toBe(
        'pending-security-registration',
      );
    }
  });
});
