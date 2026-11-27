import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';

type PinnedService = {
  version: string;
  repositoryPath: string;
  sourceUrl: string;
  snapshot: string;
  sourceSha256: string;
  snapshotSha256: string;
};

type FixtureManifest = {
  repository: string;
  commit: string;
  sanitization: string;
  services: Record<'M1' | 'M2', PinnedService>;
};

type OpenApiDocument = {
  info: { version: string };
  paths: Record<string, Record<string, any>>;
  components: {
    parameters?: Record<string, any>;
    schemas: Record<string, any>;
  };
};

const fixtureDirectory = join(__dirname, '../docs/contratos/fixtures/g5-pinned');
const manifest = JSON.parse(
  readFileSync(join(fixtureDirectory, 'manifest.json'), 'utf8'),
) as FixtureManifest;
const forbiddenSpecKeys = new Set(['servers', 'example', 'examples']);
const normalizeLineEndings = (source: string): string => source.replace(/\r\n/g, '\n');

function sha256Upper(source: string): string {
  return createHash('sha256').update(source).digest('hex').toUpperCase();
}

function findForbiddenSpecKeys(value: unknown, currentPath = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findForbiddenSpecKeys(item, `${currentPath}[${index}]`),
    );
  }
  if (!value || typeof value !== 'object') return [];

  return Object.entries(value).flatMap(([key, child]) => {
    const keyPath = currentPath ? `${currentPath}.${key}` : key;
    if (forbiddenSpecKeys.has(key)) return [keyPath];
    return findForbiddenSpecKeys(child, keyPath);
  });
}

function loadPinnedSpec(service: 'M1' | 'M2'): {
  document: OpenApiDocument;
  snapshotSha256: string;
} {
  const fixture = manifest.services[service];
  const source = readFileSync(join(fixtureDirectory, fixture.snapshot), 'utf8');
  const normalizedSource = normalizeLineEndings(source);
  const snapshotSha256 = sha256Upper(normalizedSource);

  expect(snapshotSha256).toBe(fixture.snapshotSha256);

  return {
    document: load(normalizedSource) as OpenApiDocument,
    snapshotSha256,
  };
}

describe('G5 pinned-spec/offline surface validation', () => {
  let m1: OpenApiDocument;
  let m2: OpenApiDocument;
  let m1SnapshotSha256: string;
  let m2SnapshotSha256: string;

  beforeAll(() => {
    const m1Snapshot = loadPinnedSpec('M1');
    const m2Snapshot = loadPinnedSpec('M2');
    m1 = m1Snapshot.document;
    m2 = m2Snapshot.document;
    m1SnapshotSha256 = m1Snapshot.snapshotSha256;
    m2SnapshotSha256 = m2Snapshot.snapshotSha256;
  });

  it('normalizes CRLF to LF before hashing without changing snapshot content', () => {
    for (const service of ['M1', 'M2'] as const) {
      const fixture = manifest.services[service];
      const original = readFileSync(join(fixtureDirectory, fixture.snapshot), 'utf8');
      const canonical = normalizeLineEndings(original);
      const crlf = canonical.replace(/\n/g, '\r\n');

      expect(normalizeLineEndings(crlf)).toBe(canonical);
      expect(sha256Upper(normalizeLineEndings(crlf))).toBe(fixture.snapshotSha256);
      expect(load(normalizeLineEndings(crlf))).toEqual(load(canonical));
    }
  });

  it('pins source provenance, sanitized snapshot hashes, and exact OpenAPI versions', () => {
    expect(manifest.repository).toBe('Taller-SW-Web/G5-Ventas-Postventas-Backend');
    expect(manifest.commit).toBe('95325de5b9b1db44fcfb92e945256b604f0a86f7');
    expect(manifest.sanitization).toContain('sanitized pinned OpenAPI extracts');
    expect(manifest.services.M1.repositoryPath).toBe(
      'servicio-ventas/src/main/resources/static/openapi/ventas.yaml',
    );
    expect(manifest.services.M1.sourceUrl).toContain(`/${manifest.commit}/`);
    expect(manifest.services.M2.repositoryPath).toBe(
      'servicio-postventa/src/main/resources/static/openapi/postventa.yaml',
    );
    expect(manifest.services.M2.sourceUrl).toContain(`/${manifest.commit}/`);
    expect(manifest.services.M1.sourceSha256).toBe(
      '53F6BF94DE1CE848CB80C684A1BF980BE34CD0EA94ECD9C4BB13FD814FA92879',
    );
    expect(manifest.services.M2.sourceSha256).toBe(
      '974CC62629B2CA1FA0EA51632C39D022977ECEEC52AF833152C8DE1837D9B706',
    );
    expect(m1SnapshotSha256).toBe(manifest.services.M1.snapshotSha256);
    expect(m2SnapshotSha256).toBe(manifest.services.M2.snapshotSha256);
    expect(m1.info.version).toBe('1.10.0');
    expect(m2.info.version).toBe('1.6.0');
  });

  it('contains no server definitions or example fields in either sanitized extract', () => {
    expect(findForbiddenSpecKeys(m1)).toEqual([]);
    expect(findForbiddenSpecKeys(m2)).toEqual([]);
  });

  it('checks M1 order creation path, idempotency, and request/response schemas', () => {
    const operation = m1.paths['/api/v1/pedidos'].post;
    const requestSchema = m1.components.schemas.CrearPedidoRequest;
    const paymentSchema = requestSchema.properties.pago;
    const itemSchema = requestSchema.properties.items.items;

    expect(operation.operationId).toBe('crearPedido');
    expect(operation.security).toContainEqual({
      TokenServicio: ['ventas:pedidos:crear'],
    });
    expect(operation.parameters).toContainEqual({
      $ref: '#/components/parameters/IdempotencyKey',
    });
    expect(m1.components.parameters?.IdempotencyKey).toMatchObject({
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      schema: { type: 'string', format: 'uuid' },
    });
    expect(operation.requestBody.content['application/json'].schema.$ref).toBe(
      '#/components/schemas/CrearPedidoRequest',
    );
    expect(requestSchema.required).toEqual(['canal', 'contacto', 'items', 'pago']);
    expect(requestSchema.properties).toHaveProperty('envio');
    expect(requestSchema.required).not.toContain('envio');
    expect(itemSchema.required).toEqual([
      'productoId',
      'sku',
      'cantidad',
      'precioUnitario',
    ]);
    expect(paymentSchema.required).toEqual([
      'metodoPago',
      'moneda',
      'subtotal',
      'total',
    ]);
    expect(paymentSchema.properties).toHaveProperty('comprobanteReferencia');
    expect(paymentSchema.required).not.toContain('comprobanteReferencia');
    expect(operation.responses).toHaveProperty('201');
    expect(operation.responses).toHaveProperty('200');
    expect(
      operation.responses['201'].content['application/json'].schema.$ref,
    ).toBe('#/components/schemas/CrearPedidoResponse');
    expect(m1.components.schemas.CrearPedidoResponse.required).toEqual([
      'pedidoId',
      'estado',
      'total',
      'moneda',
      'canal',
      'fechaCreacion',
    ]);
    expect(operation.responses['409'].description).toContain('IDEMPOTENCY_KEY_REUSED');
    expect(operation.description).toContain('Misma clave y mismo cuerpo: 200');
    expect(m1.components.schemas.Error.required).toEqual([
      'codigo',
      'mensaje',
      'timestamp',
    ]);
  });

  it('checks M1 authenticated /me path, pagination, and response shape', () => {
    const operation = m1.paths['/api/v1/pedidos/me'].get;
    const parameters = operation.parameters as Array<Record<string, any>>;
    const queryParameters = Object.fromEntries(
      parameters
        .filter((parameter) => parameter.in === 'query')
        .map((parameter) => [parameter.name, parameter.schema]),
    );

    expect(operation.operationId).toBe('listarMisPedidos');
    expect(operation.security).toContainEqual({ TokenUsuario: ['CLIENTE'] });
    expect(operation.description).toContain('claim sub del token');
    expect(parameters).not.toContainEqual(expect.objectContaining({ name: 'clienteId' }));
    expect(queryParameters.page).toMatchObject({
      type: 'integer',
      minimum: 1,
      default: 1,
    });
    expect(queryParameters.pageSize).toMatchObject({
      type: 'integer',
      minimum: 1,
      maximum: 50,
      default: 10,
    });
    expect(
      operation.responses['200'].content['application/json'].schema.$ref,
    ).toBe('#/components/schemas/MisPedidos');
    expect(Object.keys(m1.components.schemas.MisPedidos.properties)).toEqual([
      'items',
      'total',
      'page',
      'pageSize',
    ]);
  });

  it('checks M1 order detail path, authorization alternatives, and response shape', () => {
    const operation = m1.paths['/api/v1/pedidos/{pedidoId}'].get;

    expect(operation.operationId).toBe('consultarPedido');
    expect(operation.parameters).toContainEqual({
      $ref: '#/components/parameters/PedidoId',
    });
    expect(m1.components.parameters?.PedidoId).toMatchObject({
      name: 'pedidoId',
      in: 'path',
      required: true,
    });
    expect(operation.security).toEqual([
      { TokenUsuario: ['CLIENTE', 'ADMIN_VENTAS'] },
      { TokenServicio: ['ventas:pedidos:consultar'] },
    ]);
    expect(
      operation.responses['200'].content['application/json'].schema.$ref,
    ).toBe('#/components/schemas/PedidoDetalle');
    expect(Object.keys(m1.components.schemas.PedidoDetalle.properties)).toEqual(
      expect.arrayContaining(['contacto', 'pago', 'envio', 'items']),
    );
    expect(operation.responses['403'].description).toContain('ACCESO_DENEGADO');
    expect(operation.responses['404'].description).toContain('PEDIDO_NO_ENCONTRADO');
  });

  it('checks M2 CSAT path, CLIENTE authorization, and request/response facts', () => {
    const operation = m2.paths['/api/v2/csat'].post;
    const requestSchema = m2.components.schemas.RegistrarCsatRequest;
    const score = requestSchema.properties.puntuacion;

    expect(operation.operationId).toBe('registrarCsat');
    expect(operation.security).toContainEqual({ TokenUsuario: ['CLIENTE'] });
    expect(operation.requestBody.content['application/json'].schema.$ref).toBe(
      '#/components/schemas/RegistrarCsatRequest',
    );
    expect(requestSchema.required).toEqual([
      'pedidoId',
      'clienteId',
      'canal',
      'puntuacion',
    ]);
    expect(requestSchema.properties).toHaveProperty('comentario');
    expect(requestSchema.required).not.toContain('comentario');
    expect(score).toMatchObject({ type: 'integer', minimum: 1, maximum: 5 });
    expect(operation.description).toContain('1, 3 y 5');
    expect(operation.responses).toHaveProperty('201');
    expect(operation.responses['201'].content).toBeUndefined();
    expect(operation.responses['403'].description).toContain('ACCESO_DENEGADO');
    expect(operation.responses['409'].description).toContain('CSAT_ALREADY_SUBMITTED');
    expect(operation.responses['422'].description).toContain('ORDER_NOT_DELIVERED');
  });
});
