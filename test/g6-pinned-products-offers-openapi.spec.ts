import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

type JsonObject = Record<string, any>;
type ContractManifest = {
  repository: string;
  commit: string;
  sourcePath: string;
  sourceBlobSha: string;
  openapiVersion: string;
  snapshot: string;
  snapshotSha256: string;
  scope: string[];
  sourceStatus: string;
};

const CONTRACT_DIRECTORY = join(__dirname, '../docs/contratos/fixtures/g6-pinned');
const manifest = JSON.parse(
  readFileSync(join(CONTRACT_DIRECTORY, 'manifest.json'), 'utf8'),
) as ContractManifest;
const snapshotBytes = readFileSync(join(CONTRACT_DIRECTORY, manifest.snapshot));
const contract = JSON.parse(snapshotBytes.toString('utf8')) as JsonObject;
const ajv = new Ajv({ allErrors: true, allowUnionTypes: true, strict: false });
addFormats(ajv);
for (const format of ['int32', 'int64', 'float', 'double', 'byte', 'binary', 'password']) {
  ajv.addFormat(format, true);
}

function resolvePointer(pointer: string): any {
  return pointer
    .slice(2)
    .split('/')
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((current, part) => current?.[part], contract);
}

function resolveRef(value: any): any {
  if (value && typeof value === 'object' && typeof value.$ref === 'string') {
    if (!value.$ref.startsWith('#/')) throw new Error(`External reference not pinned: ${value.$ref}`);
    return resolvePointer(value.$ref);
  }
  return value;
}

function dereferenceSchema(schema: any, seen = new Set<string>()): any {
  if (Array.isArray(schema)) return schema.map((value) => dereferenceSchema(value, seen));
  if (!schema || typeof schema !== 'object') return schema;
  if (typeof schema.$ref === 'string') {
    const ref = schema.$ref;
    if (seen.has(ref)) return {};
    const target = resolvePointer(ref);
    if (target === undefined) throw new Error(`Unresolved schema reference: ${ref}`);
    const siblings = Object.fromEntries(Object.entries(schema).filter(([key]) => key !== '$ref'));
    return dereferenceSchema({ ...target, ...siblings }, new Set([...seen, ref]));
  }
  const { example: _example, examples: _examples, nullable, ...rest } = schema;
  const converted = Object.fromEntries(
    Object.entries(rest).map(([key, value]) => [key, dereferenceSchema(value, seen)]),
  );
  return nullable === true ? { anyOf: [converted, { type: 'null' }] } : converted;
}

function operation(path: string, method: string): JsonObject {
  const result = contract.paths?.[path]?.[method];
  if (!result) throw new Error(`Pinned OpenAPI missing ${method.toUpperCase()} ${path}`);
  return result;
}

function responseExamples(response: JsonObject): Array<{ schema: any; value: unknown; label: string }> {
  const resolvedResponse = resolveRef(response);
  return Object.entries(resolvedResponse.content ?? {}).flatMap(([mediaType, media]: [string, any]) => {
    const schema = media.schema;
    if (!schema) return [];
    const examples = media.examples
      ? Object.entries(media.examples).map(([name, item]: [string, any]) => [name, item.value] as const)
      : media.example === undefined ? [] : [['example', media.example] as const];
    return examples.map(([name, value]) => ({ schema, value, label: `${mediaType} ${name}` }));
  });
}

describe('G6 Productos y Ofertas OpenAPI pinned contract', () => {
  it('pins source provenance, version, and sanitized snapshot hash', () => {
    expect(manifest.repository).toBe('Taller-SW-Web/G6-Productos-Ofertas-docs');
    expect(manifest.commit).toMatch(/^[a-f0-9]{40}$/);
    expect(manifest.sourceBlobSha).toBe('e094988f0f0d92a7a4241c1dc30a5e50d9ff709a');
    expect(manifest.openapiVersion).toBe('0.7.0-rc.3');
    expect(contract.info.version).toBe(manifest.openapiVersion);
    expect(createHash('sha256').update(snapshotBytes).digest('hex').toUpperCase())
      .toBe(manifest.snapshotSha256);
    expect(manifest.sourceStatus).toContain('consumer-side homologation');
  });

  it.each([
    ['/productos', 'get', 'listarProductos', ['200', '400', '401', '403', '422', '429', '500', '503']],
    ['/productos/por-slug/{slug}', 'get', 'obtenerProductoPorSlug', ['200', '401', '403', '404', '429', '500', '503']],
    ['/precios/skus/{sku}', 'get', 'obtenerPrecioSku', ['200', '400', '401', '403', '404', '429', '500', '503']],
    ['/promociones/evaluar', 'post', 'evaluarPromociones', ['200', '400', '401', '403', '422', '429', '500', '503']],
    ['/inventario/disponibilidad/comercial', 'get', 'consultarDisponibilidadComercial', ['200', '400', '401', '403', '429', '500', '503']],
  ])('%s %s exposes the pinned operation, response schemas, and expected cases', (path, method, operationId, statuses) => {
    const op = operation(path, method);
    expect(op.operationId).toBe(operationId);
    for (const status of statuses) {
      const response = resolveRef(op.responses?.[status]);
      expect(response).toBeDefined();
      const media = response.content?.['application/problem+json'] ?? response.content?.['application/json'];
      expect(media?.schema).toBeDefined();
    }
  });

  it('validates every declared request/response example in the selected operations against its schema', () => {
    const failures: string[] = [];
    let validated = 0;
    const operations = manifest.scope.map((entry) => {
      const [method, ...rest] = entry.split(' ');
      return operation(rest.join(' '), method.toLowerCase());
    });

    for (const op of operations) {
      const cases: Array<{ schema: any; value: unknown; label: string }> = [];
      for (const [status, response] of Object.entries(op.responses ?? {})) {
        cases.push(...responseExamples(response as JsonObject)
          .map((example) => ({ ...example, label: `${op.operationId} ${status} ${example.label}` })));
      }
      for (const [mediaType, media] of Object.entries(op.requestBody?.content ?? {}) as Array<[string, any]>) {
        const schema = media.schema;
        if (!schema) continue;
        const examples = media.examples
          ? Object.entries(media.examples).map(([name, item]: [string, any]) => [name, item.value] as const)
          : media.example === undefined ? [] : [['example', media.example] as const];
        cases.push(...examples.map(([name, value]) => ({
          schema, value, label: `${op.operationId} request ${mediaType} ${name}`,
        })));
      }
      for (const example of cases) {
        validated += 1;
        try {
          const validate = ajv.compile(dereferenceSchema(example.schema));
          if (!validate(example.value)) {
            failures.push(`${example.label}: ${ajv.errorsText(validate.errors)}`);
          }
        } catch (error) {
          failures.push(`${example.label}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    expect(validated).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  });
});
