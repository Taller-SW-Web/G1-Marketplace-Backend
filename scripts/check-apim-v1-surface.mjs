import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  BLOCKED_ROUTES,
  CONTRACTED_CART_ROUTES,
  SOURCE_CONTRACTS,
  buildOpenApiArtifact,
  expectedOperationKeys,
  findComponentReferences,
  outputComponentInventory,
  outputFilePath,
  outputOperationBlock,
  outputPathOperations,
} from './apim-v1-openapi.mjs';

const result = buildOpenApiArtifact();
const artifactPath = outputFilePath();
const artifact = readFileSync(artifactPath, 'utf8').replace(/\r\n/g, '\n');
const expectedArtifact = result.output.replace(/\r\n/g, '\n');
assert.equal(
  artifact,
  expectedArtifact,
  `El OpenAPI consolidado esta desactualizado. Ejecuta: npm run build:apim:v1 (${artifactPath})`,
);

const expectedOperations = expectedOperationKeys(result);
const parsedRoutes = outputPathOperations(artifact);
assert.equal(result.contractedOperations.length, 41, 'Deben existir exactamente 41 operaciones contratadas');
assert.equal(parsedRoutes.operations.length, 41, 'El OpenAPI debe contener exactamente 41 operaciones');
assert.deepEqual(parsedRoutes.operations, expectedOperations, 'Las rutas/metodos consolidados deben coincidir con las fuentes');
assert.equal(new Set(parsedRoutes.paths).size, parsedRoutes.paths.length, 'No debe haber paths duplicados');
assert.ok(parsedRoutes.paths.every((path) => path.startsWith('/v1/')), 'Todos los paths deben comenzar en /v1');
assert.ok(parsedRoutes.paths.every((path) => !path.startsWith('/api/v1')), 'No debe quedar el prefijo BFF /api/v1');
assert.ok(!parsedRoutes.paths.includes('/health'), 'GET /health no pertenece al subconjunto importable');

for (const operation of result.contractedOperations) {
  assert.ok(operation.sourcePath.startsWith('/api/v1/'), `${operation.sourcePath} no tiene prefijo fuente esperado`);
  assert.equal(operation.publicPath, operation.sourcePath.slice('/api'.length), `Se altero una ruta distinta al prefijo: ${operation.sourcePath}`);
}
assert.deepEqual(
  result.sourcePathsOutsideV1,
  ['GET /health'],
  'La unica operacion fuente fuera de /api/v1 debe ser GET /health',
);

assert.match(artifact, /^openapi: 3\.1\.0$/m, 'Falta la version OpenAPI consolidada');
assert.match(artifact, /^  title: .*contracted subset/m, 'El titulo debe identificar un subconjunto');
assert.match(artifact, /^x-artifact-scope: "contracted-subset-of-bff-not-complete-contract"$/m);
assert.match(artifact, /^x-backend-host-configured: false$/m);
assert.doesNotMatch(artifact, /^servers:/m, 'No se debe inventar ni fijar un backend server');
assert.doesNotMatch(artifact, /^security:/m, 'No se debe filtrar la seguridad global de un contrato a otros dominios');

for (const source of SOURCE_CONTRACTS) {
  assert.ok(artifact.includes(`docs/contratos/${source.file}`), `No se declaro la fuente ${source.file}`);
}

for (const blocked of BLOCKED_ROUTES) {
  const publicOperation = blocked.operation.replace(' /api/v1/', ' /v1/');
  const source = readFileSync(blocked.source, 'utf8');
  assert.ok(source.includes(blocked.marker), `Revisa la ruta bloqueada ${blocked.operation} en ${blocked.source}`);
  assert.ok(!expectedOperations.includes(publicOperation),
    `La ruta sin contrato no debe aparecer en las fuentes: ${blocked.operation}`);
  assert.ok(artifact.includes(`"${blocked.operation}"`), `No se documento el bloqueo de ${blocked.operation}`);
  assert.ok(!parsedRoutes.operations.includes(publicOperation),
    `La ruta sin contrato no debe aparecer en el OpenAPI: ${blocked.operation}`);
}
for (const route of CONTRACTED_CART_ROUTES) {
  assert.ok(expectedOperations.includes(route.publicOperation),
    `La ruta de carrito contratada debe aparecer en las fuentes: ${route.sourceOperation}`);
  assert.ok(parsedRoutes.operations.includes(route.publicOperation),
    `La ruta de carrito contratada debe aparecer en el OpenAPI: ${route.publicOperation}`);
}
assert.match(artifact, /^x-source-security-errors:$/m, 'Debe conservarse el catalogo de errores de seguridad de origen');

const inventory = outputComponentInventory(artifact);
assert.ok(inventory.size > 0, 'El documento debe incluir components');
for (const reference of findComponentReferences(artifact)) {
  assert.ok(reference.startsWith('#/components/'), `Referencia externa/no local no permitida: ${reference}`);
  const parts = reference.slice(2).split('/');
  assert.equal(parts.length, 3, `Referencia fuera de components no soportada: ${reference}`);
  const section = parts[1].replaceAll('~1', '/').replaceAll('~0', '~');
  const name = parts[2].replaceAll('~1', '/').replaceAll('~0', '~');
  assert.ok(inventory.get(section)?.has(name), `Referencia sin destino: ${reference}`);
}

for (const { file, id } of SOURCE_CONTRACTS) {
  if (id !== 'checkout') continue;
  const checkoutOperations = result.contractedOperations.filter((operation) => operation.file === file);
  assert.equal(checkoutOperations.length, 11, 'Checkout debe mantener sus once operaciones documentadas');
  for (const operation of checkoutOperations) {
    if (operation.sourcePath === '/api/v1/webhooks/ventas/envios') {
      const pathItem = parsedRoutes.pathEntries.find(({ key }) => key === operation.publicPath);
      const block = outputOperationBlock(pathItem, operation.method.toLowerCase());
      assert.ok(block?.some((line) => /^ {8}- salesWebhookToken:\s*\[\]$/.test(line)),
        'Webhook de Ventas debe conservar su autenticación por token de webhook');
      continue;
    }
    const pathItem = parsedRoutes.pathEntries.find(({ key }) => key === operation.publicPath);
    const block = outputOperationBlock(pathItem, operation.method.toLowerCase());
    assert.ok(block?.some((line) => /^ {6}security\s*:/.test(line)),
      `No se traslado seguridad bearerAuth a ${operation.method} ${operation.publicPath}`);
    assert.ok(block?.some((line) => /^ {8}- bearerAuth:\s*\[\]$/.test(line)),
      `No se preservo el requisito Bearer de ${operation.method} ${operation.publicPath}`);
  }
}

for (const entry of parsedRoutes.pathEntries) {
  const methods = entry.lines.flatMap((line) => {
    const match = line.match(/^ {4}(?:"([^"]+)"|'([^']+)'|([^:\s][^:]*)):\s*/);
    const method = (match?.[1] ?? match?.[2] ?? match?.[3] ?? '').toLowerCase();
    return ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'].includes(method) ? [method] : [];
  });
  for (const method of methods) {
    const operation = outputOperationBlock(entry, method);
    assert.ok(operation?.some((line) => /^ {6}(?:"responses"|responses)\s*:/.test(line)),
      `Falta responses en ${method.toUpperCase()} ${entry.key}`);
  }
}

// Parse and inspect the whole YAML document when the existing project dependency is available.
// The deterministic, dependency-free checks above still run if node_modules is absent.
let yaml;
try {
  yaml = createRequire(import.meta.url)('js-yaml');
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}

if (yaml) {
  const document = yaml.load(artifact);
  assert.equal(document.openapi, '3.1.0');
  assert.equal(document['x-artifact-scope'], 'contracted-subset-of-bff-not-complete-contract');
  assert.equal(Object.keys(document.paths).length, parsedRoutes.paths.length);
  for (const [path, pathItem] of Object.entries(document.paths)) {
    assert.ok(path.startsWith('/v1/'));
    const operations = Object.entries(pathItem).filter(([method]) =>
      ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'].includes(method));
    assert.ok(operations.length > 0, `Path Item sin operaciones: ${path}`);
    for (const [method, operation] of operations) {
      assert.ok(operation.responses && Object.keys(operation.responses).length > 0,
        `OpenAPI operation sin responses: ${method.toUpperCase()} ${path}`);
    }
  }
  console.log('YAML/OpenAPI object structure: parsed with js-yaml.');
} else {
  console.log('YAML parser unavailable (node_modules absent); deterministic structure scan passed.');
}

console.log(`Source contracts: ${SOURCE_CONTRACTS.length}`);
console.log(`Contracted operations /api/v1 -> /v1: ${parsedRoutes.operations.length}`);
console.log(`OpenAPI paths: ${parsedRoutes.paths.length}`);
console.log(`Resolved local component references: ${findComponentReferences(artifact).length}`);
console.log('Excluded source operation: GET /health');
if (BLOCKED_ROUTES.length === 0) {
  console.log('No implemented-but-uncontracted BFF routes are blocked.');
} else {
  console.log('Explicitly blocked BFF routes:');
  for (const { operation } of BLOCKED_ROUTES) console.log(`  BLOCKED ${operation}`);
}
console.log('Newly contracted cart routes:');
for (const { publicOperation } of CONTRACTED_CART_ROUTES) console.log(`  INCLUDED ${publicOperation}`);
console.log('No backend host, Azure call, import, or deployment was performed.');
