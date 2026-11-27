import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const repository = 'Taller-SW-Web/G6-Productos-Ofertas-docs';
const commit = '40524e96c6973f84d74160076781702fe2a3da19';
const repositoryPath = 'contratos/http/openapi.yaml';
const expectedVersion = '0.7.0-rc.3';
const directory = join(dirname(fileURLToPath(import.meta.url)), '../docs/contratos/fixtures/g6-pinned');
const sourcePath = process.argv[2];

if (!sourcePath) {
  throw new Error('Pass a local path to the already retrieved OpenAPI source; this script performs no network requests.');
}

const sourceBytes = readFileSync(resolve(sourcePath));
const source = yaml.load(sourceBytes.toString('utf8'));
if (source.info?.version !== expectedVersion) {
  throw new Error(`Expected ${expectedVersion}, received ${source.info?.version ?? 'no version'}`);
}

const pathsToKeep = [
  '/productos',
  '/productos/{productoId}',
  '/productos/por-slug/{slug}',
  '/precios/skus/{sku}',
  '/inventario/disponibilidad/comercial',
];
const schemasToKeep = [
  'Canal',
  'CanalComercial',
  'EstadoProducto',
  'OrdenCatalogo',
  'ProductoResumenComercial',
  'PaginaProductosComercial',
  'ProductoDetalleComercial',
  'MarcaComercial',
  'VarianteComercial',
  'Atributo',
  'Precio',
  'DisponibilidadComercial',
  'ConsultaDisponibilidadComercialResponse',
];

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['servers', 'example', 'examples'].includes(key))
    .map(([key, child]) => [key, sanitize(child)]));
}

const pinnedPaths = {};
for (const path of pathsToKeep) {
  const operation = source.paths?.[path]?.get;
  if (!operation) throw new Error(`Missing expected GET operation: ${path}`);
  const parameters = (operation.parameters ?? []).map((input) => {
    const parameter = input.$ref
      ? source.components.parameters[input.$ref.split('/').at(-1)]
      : input;
    if (!parameter) throw new Error(`Could not resolve parameter in ${path}`);
    const selected = {};
    for (const key of ['name', 'in', 'required', 'style', 'explode', 'schema']) {
      if (parameter[key] !== undefined) selected[key] = parameter[key];
    }
    return sanitize(selected);
  });
  const responses = Object.fromEntries(Object.entries(operation.responses ?? {}).map(([status, response]) => {
    const selected = { description: response.description ?? '' };
    const schema = response.content?.['application/json']?.schema;
    if (schema) selected.content = { 'application/json': { schema: sanitize(schema) } };
    return [status, selected];
  }));
  const selected = {};
  for (const key of [
    'operationId',
    'x-status',
    'x-service-audience',
    'x-required-scope',
    'x-scope-registration-status',
    'security',
  ]) {
    if (operation[key] !== undefined) selected[key] = operation[key];
  }
  selected.parameters = parameters;
  selected.responses = responses;
  pinnedPaths[path] = { get: sanitize(selected) };
}

const schemas = {};
for (const name of schemasToKeep) {
  const schema = source.components?.schemas?.[name];
  if (!schema) throw new Error(`Missing expected schema: ${name}`);
  schemas[name] = sanitize(schema);
}
const correlationId = source.components?.parameters?.CorrelationId;
if (!correlationId) throw new Error('Missing CorrelationId parameter');

const snapshot = {
  openapi: source.openapi,
  info: { title: 'Productos y Ofertas — extracto H5', version: source.info.version },
  paths: pinnedPaths,
  components: {
    parameters: { CorrelationId: sanitize(correlationId) },
    schemas,
  },
};
const snapshotBytes = Buffer.from(`${JSON.stringify(snapshot, null, 2)}\n`);
const snapshotPath = join(directory, 'marketplace-surface.json');
writeFileSync(snapshotPath, snapshotBytes);

const manifest = {
  repository,
  commit,
  repositoryPath,
  gitBlob: createHash('sha1')
    .update(Buffer.concat([Buffer.from(`blob ${sourceBytes.length}\0`), sourceBytes]))
    .digest('hex'),
  version: expectedVersion,
  sourceUrl: `https://github.com/${repository}/blob/${commit}/${repositoryPath}`,
  sourceSha256: createHash('sha256').update(sourceBytes).digest('hex').toUpperCase(),
  purpose: 'Offline validation of selected catalog, price, and commercial-availability OpenAPI surface only; it is not a compatibility, deployment, or REAL integration claim.',
  retrieval: 'Public source read at the exact commit. No G6 business API, sandbox, credential, or deployment was contacted.',
  sanitization: 'Curated extract preserving selected GET operation identifiers, scope/security metadata, parameters, response status keys, and selected response schemas. All server definitions and example/examples fields are omitted. The extract is not byte-identical to the upstream OpenAPI and is not a full copy.',
  snapshot: 'marketplace-surface.json',
  snapshotSha256: createHash('sha256').update(snapshotBytes).digest('hex').toUpperCase(),
};
writeFileSync(join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ version: manifest.version, sourceSha256: manifest.sourceSha256, gitBlob: manifest.gitBlob, snapshotSha256: manifest.snapshotSha256 }, null, 2));
