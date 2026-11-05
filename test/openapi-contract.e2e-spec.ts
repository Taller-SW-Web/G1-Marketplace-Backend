/**
 * Pruebas de contrato del BFF de detalle de producto (F-011 a F-015).
 *
 * Dos garantías complementarias:
 *   1. Cada ejemplo declarado en los OpenAPI versionados cumple el schema que
 *      lo acompaña, sin depender de que el BFF esté levantado.
 *   2. Las respuestas reales del BFF (MOCK) cumplen el schema y el status que
 *      publica docs/contratos/product-detail-h4.openapi.yaml.
 *
 * @see docs/contratos/product-detail-h4.openapi.yaml
 */

import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { load as loadYaml } from 'js-yaml';
import request from 'supertest';
import { ProductCommerceModule } from '../src/catalog/product-commerce.module';
import { ProductDetailModule } from '../src/catalog/product-detail.module';
import { NotFoundFilter } from '../src/http/not-found.filter';
import { requestIdMiddleware } from '../src/http/request-id.middleware';

type JsonObject = Record<string, any>;

interface LoadedContract {
  file: string;
  document: JsonObject;
}

interface ExampleCase {
  location: string;
  schema: any;
  value: unknown;
}

const CONTRACTS_DIR = resolve(__dirname, '..', 'docs', 'contratos');
const PRODUCT_DETAIL_CONTRACT = 'product-detail-h4.openapi.yaml';

const ajv = new Ajv({
  allErrors: true,
  allowUnionTypes: true,
  strict: false,
});
addFormats(ajv);
// Formatos propios de OpenAPI que no son parte de JSON Schema.
for (const format of ['int32', 'int64', 'float', 'double', 'byte', 'binary', 'password']) {
  ajv.addFormat(format, true);
}

const compiledSchemas = new Map<string, ReturnType<typeof ajv.compile>>();

function resolvePointer(document: JsonObject, pointer: string): any {
  return pointer
    .split('/')
    .filter((part) => part.length > 0)
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce(
      (current, part) => (current == null ? undefined : current[part]),
      document as any,
    );
}

function resolveIfRef(document: JsonObject, value: any): any {
  if (
    value &&
    typeof value === 'object' &&
    typeof value.$ref === 'string' &&
    value.$ref.startsWith('#/')
  ) {
    return resolvePointer(document, value.$ref.slice(2));
  }
  return value;
}

/**
 * Convierte un schema OpenAPI 3.0/3.1 a JSON Schema compilable por Ajv:
 * resuelve $ref locales y traduce `nullable: true` a una unión con null.
 */
function toJsonSchema(
  schema: any,
  document: JsonObject,
  seen = new Set<string>(),
): any {
  if (Array.isArray(schema)) {
    return schema.map((item) => toJsonSchema(item, document, seen));
  }
  if (!schema || typeof schema !== 'object') return schema;

  if (typeof schema.$ref === 'string' && schema.$ref.startsWith('#/')) {
    const ref = schema.$ref;
    if (seen.has(ref)) return {};
    const target = resolvePointer(document, ref.slice(2));
    if (target === undefined) {
      throw new Error(`Referencia OpenAPI no resuelta: ${ref}`);
    }
    const resolved = toJsonSchema(target, document, new Set([...seen, ref]));
    const siblings = Object.fromEntries(
      Object.entries(schema).filter(([key]) => key !== '$ref'),
    );
    return toJsonSchema({ ...resolved, ...siblings }, document, seen);
  }

  const { nullable, ...rest } = schema;
  const converted: JsonObject = {};
  for (const [key, value] of Object.entries(rest)) {
    // Anotaciones OpenAPI que no aportan validación estructural.
    if (
      key === 'example' ||
      key === 'examples' ||
      key === 'xml' ||
      key === 'discriminator' ||
      key === 'externalDocs'
    ) {
      continue;
    }
    converted[key] = toJsonSchema(value, document, seen);
  }

  return nullable === true
    ? { anyOf: [converted, { type: 'null' }] }
    : converted;
}

function validateValue(
  document: JsonObject,
  schema: any,
  value: unknown,
  label: string,
): void {
  const jsonSchema = toJsonSchema(schema, document);
  const cacheKey = JSON.stringify(jsonSchema);
  let validate = compiledSchemas.get(cacheKey);
  if (!validate) {
    validate = ajv.compile(jsonSchema);
    compiledSchemas.set(cacheKey, validate);
  }
  if (!validate(value)) {
    throw new Error(
      `${label} no cumple el schema:\n${ajv.errorsText(validate.errors, {
        separator: '\n',
      })}`,
    );
  }
}

function loadContracts(): LoadedContract[] {
  return readdirSync(CONTRACTS_DIR)
    .filter((file) => /\.(json|ya?ml)$/i.test(file))
    .map((file) => {
      const raw = readFileSync(join(CONTRACTS_DIR, file), 'utf8');
      const document =
        extname(file).toLowerCase() === '.json'
          ? JSON.parse(raw)
          : loadYaml(raw);
      return { file, document: document as JsonObject };
    })
    .filter(
      ({ document }) =>
        typeof document?.openapi === 'string' && document.paths != null,
    );
}

/** Recoge `example`, `examples` y ejemplos de media type de todo el contrato. */
function collectExamples(document: JsonObject): ExampleCase[] {
  const cases: ExampleCase[] = [];

  const add = (schema: any, value: unknown, location: string): void => {
    if (schema !== undefined && value !== undefined) {
      cases.push({ location, schema, value });
    }
  };

  const visitSchema = (schema: any, location: string): void => {
    if (!schema || typeof schema !== 'object') return;

    if (typeof schema.$ref === 'string' && schema.$ref.startsWith('#/')) {
      const target = resolvePointer(document, schema.$ref.slice(2));
      visitSchema(target, `${location}<${schema.$ref}>`);
      if (schema.example !== undefined) add(schema, schema.example, `${location}/example`);
      return;
    }

    if (schema.example !== undefined) {
      add(schema, schema.example, `${location}/example`);
    }
    if (Array.isArray(schema.examples)) {
      schema.examples.forEach((value: unknown, index: number) => {
        add(schema, value, `${location}/examples/${index}`);
      });
    }
    for (const [name, propertySchema] of Object.entries(
      schema.properties ?? {},
    )) {
      visitSchema(propertySchema, `${location}/properties/${name}`);
    }
    if (schema.items) visitSchema(schema.items, `${location}/items`);
    for (const keyword of ['allOf', 'anyOf', 'oneOf', 'prefixItems']) {
      if (Array.isArray(schema[keyword])) {
        schema[keyword].forEach((subSchema: any, index: number) => {
          visitSchema(subSchema, `${location}/${keyword}/${index}`);
        });
      }
    }
    if (
      schema.additionalProperties &&
      typeof schema.additionalProperties === 'object'
    ) {
      visitSchema(schema.additionalProperties, `${location}/additionalProperties`);
    }
    if (schema.not) visitSchema(schema.not, `${location}/not`);
  };

  const visitMedia = (media: any, location: string): void => {
    if (!media || typeof media !== 'object') return;
    if (media.schema) visitSchema(media.schema, `${location}/schema`);
    if (media.example !== undefined) {
      add(media.schema, media.example, `${location}/example`);
    }
    for (const [name, example] of Object.entries(media.examples ?? {})) {
      const value = (example as any)?.value;
      if (value !== undefined) {
        add(media.schema, value, `${location}/examples/${name}`);
      }
    }
  };

  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    const methods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];
    for (const [method, operation] of Object.entries(pathItem as JsonObject)) {
      if (!methods.includes(method)) continue;
      const operationObject = operation as JsonObject;
      const operationLabel = `${method.toUpperCase()} ${path}`;

      const parameters = [
        ...((pathItem as JsonObject).parameters ?? []),
        ...(operationObject.parameters ?? []),
      ];
      for (const rawParameter of parameters) {
        const parameter = resolveIfRef(document, rawParameter);
        if (parameter?.schema) {
          visitSchema(
            parameter.schema,
            `${operationLabel}/parameters/${parameter.name}/schema`,
          );
        }
        if (parameter?.example !== undefined) {
          add(
            parameter.schema,
            parameter.example,
            `${operationLabel}/parameters/${parameter.name}/example`,
          );
        }
        for (const [name, example] of Object.entries(
          parameter?.examples ?? {},
        )) {
          const value = (example as any)?.value;
          if (value !== undefined) {
            add(
              parameter.schema,
              value,
              `${operationLabel}/parameters/${parameter.name}/examples/${name}`,
            );
          }
        }
      }

      if (operationObject.requestBody) {
        const requestBody = resolveIfRef(document, operationObject.requestBody);
        for (const [contentType, media] of Object.entries(
          requestBody?.content ?? {},
        )) {
          visitMedia(media, `${operationLabel}/requestBody/${contentType}`);
        }
      }

      for (const [status, rawResponse] of Object.entries(
        operationObject.responses ?? {},
      )) {
        const response = resolveIfRef(document, rawResponse);
        for (const [contentType, media] of Object.entries(
          response?.content ?? {},
        )) {
          visitMedia(
            media,
            `${operationLabel}/responses/${status}/${contentType}`,
          );
        }
      }
    }
  }

  return cases;
}

function responseSchema(
  document: JsonObject,
  path: string,
  method: string,
  status: number,
): any {
  const operation = document.paths?.[path]?.[method];
  if (!operation) {
    throw new Error(`El contrato no declara ${method.toUpperCase()} ${path}`);
  }
  const response = resolveIfRef(document, operation.responses?.[String(status)]);
  if (!response) {
    throw new Error(
      `El contrato no declara ${status} para ${method.toUpperCase()} ${path}`,
    );
  }
  const content = response.content ?? {};
  const media =
    content['application/problem+json'] ??
    content['application/json'] ??
    Object.values(content)[0];
  if (!media?.schema) {
    throw new Error(
      `La respuesta ${status} de ${method.toUpperCase()} ${path} no declara schema`,
    );
  }
  return media.schema;
}

describe('Ejemplos declarados en los contratos OpenAPI', () => {
  const contracts = loadContracts();

  it('descubre los contratos versionados en docs/contratos', () => {
    expect(contracts.map(({ file }) => file)).toEqual(
      expect.arrayContaining([
        PRODUCT_DETAIL_CONTRACT,
        'checkout-h4.openapi.yaml',
        'openapi-catalogo-h4.json',
        'openapi-h3.json',
      ]),
    );
  });

  it('valida cada ejemplo contra el schema que lo declara', () => {
    const failures: string[] = [];
    let validated = 0;

    for (const { file, document } of contracts) {
      for (const example of collectExamples(document)) {
        validated += 1;
        try {
          validateValue(
            document,
            example.schema,
            example.value,
            `${file} ${example.location}`,
          );
        } catch (error) {
          failures.push(error instanceof Error ? error.message : String(error));
        }
      }
    }

    expect(failures).toEqual([]);
    expect(validated).toBeGreaterThan(0);
  });
});

describe('Respuestas reales del BFF contra el contrato F-011 a F-015', () => {
  let app: INestApplication;
  let contract: JsonObject;

  beforeAll(async () => {
    process.env.BFF_MODE = 'mock';
    const loaded = loadContracts().find(
      ({ file }) => file === PRODUCT_DETAIL_CONTRACT,
    );
    if (!loaded) throw new Error(`No se encontró ${PRODUCT_DETAIL_CONTRACT}`);
    contract = loaded.document;

    const moduleRef = await Test.createTestingModule({
      imports: [ProductDetailModule, ProductCommerceModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(requestIdMiddleware);
    app.useGlobalFilters(new NotFoundFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    {
      name: '200 de F-011 para una ficha MOCK existente',
      requestPath: '/api/v1/catalog/products/zapatillas-running-aero-x',
      contractPath: '/api/v1/catalog/products/{slug}',
      status: 200,
    },
    {
      name: '404 de F-011 para un producto que no existe',
      requestPath: '/api/v1/catalog/products/producto-no-existente-mock',
      contractPath: '/api/v1/catalog/products/{slug}',
      status: 404,
    },
    {
      name: '400 de F-011 por slug inválido',
      requestPath: '/api/v1/catalog/products/SLUG_INVALIDO!',
      contractPath: '/api/v1/catalog/products/{slug}',
      status: 400,
    },
    {
      name: '200 de F-012 con oferta vigente',
      requestPath: '/api/v1/catalog/products/zapatillas-running-aero-x/price',
      contractPath: '/api/v1/catalog/products/{slug}/price',
      status: 200,
    },
    {
      name: '409 de F-012 sin selección de variante',
      requestPath: '/api/v1/catalog/products/producto-variable-mock/price',
      contractPath: '/api/v1/catalog/products/{slug}/price',
      status: 409,
    },
    {
      name: '200 de F-013 con variantes activas',
      requestPath: '/api/v1/catalog/products/producto-variable-mock/variants',
      contractPath: '/api/v1/catalog/products/{slug}/variants',
      status: 200,
    },
    {
      name: '200 de F-014 con disponibilidad por SKU',
      requestPath:
        '/api/v1/catalog/products/producto-variable-mock/availability?sku=SKU-MOCK-VAR-2',
      contractPath: '/api/v1/catalog/products/{slug}/availability',
      status: 200,
    },
    {
      name: '200 de F-014 indeterminado conserva el contrato publicado',
      requestPath: '/api/v1/catalog/products/producto-demostracion-7/availability',
      contractPath: '/api/v1/catalog/products/{slug}/availability',
      status: 200,
    },
    {
      name: '200 de F-015 con recomendaciones',
      requestPath:
        '/api/v1/catalog/products/zapatillas-running-aero-x/recommendations',
      contractPath: '/api/v1/catalog/products/{slug}/recommendations',
      status: 200,
    },
    {
      name: '400 de F-015 por slug inválido',
      requestPath:
        '/api/v1/catalog/products/SLUG_INVALIDO!/recommendations',
      contractPath: '/api/v1/catalog/products/{slug}/recommendations',
      status: 400,
    },
  ])('$name', async ({ requestPath, contractPath, status }) => {
    const response = await request(app.getHttpServer())
      .get(requestPath)
      .expect(status);

    expect(response.headers['x-request-id']).toBeTruthy();
    if (status >= 400) {
      expect(response.headers['content-type']).toContain(
        'application/problem+json',
      );
    }

    validateValue(
      contract,
      responseSchema(contract, contractPath, 'get', status),
      response.body,
      `${requestPath} -> ${status}`,
    );
  });
});
