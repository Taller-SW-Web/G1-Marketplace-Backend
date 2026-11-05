#!/usr/bin/env node
/**
 * Valida todos los contratos OpenAPI versionados en docs/contratos.
 *
 * `swagger-cli validate` acepta un solo archivo por invocación, por eso este
 * wrapper descubre los documentos OpenAPI de la carpeta y valida cada uno con
 * el mismo motor que usa el CLI. Devuelve un código de salida distinto de cero
 * si algún contrato es inválido, de modo que el pipeline quede bloqueado.
 *
 * Uso:
 *   node scripts/validate-openapi-contracts.mjs
 */

import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { validate } = require('@apidevtools/swagger-cli/lib/index.js');
const { load: loadYaml } = require('js-yaml');

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CONTRACTS_DIR = join(ROOT, 'docs', 'contratos');

function isOpenApiDocument(file, document) {
  return (
    typeof document === 'object' &&
    document !== null &&
    (typeof document.openapi === 'string' ||
      typeof document.swagger === 'string') &&
    document.paths != null
  );
}

function discoverContracts() {
  return readdirSync(CONTRACTS_DIR)
    .filter((file) => /\.(json|ya?ml)$/i.test(file))
    .sort()
    .map((file) => {
      const path = join(CONTRACTS_DIR, file);
      const raw = readFileSync(path, 'utf8');
      const document =
        extname(file).toLowerCase() === '.json'
          ? JSON.parse(raw)
          : loadYaml(raw);
      return { file, path, document };
    })
    .filter(({ file, document }) => isOpenApiDocument(file, document));
}

async function validateAll() {
  const contracts = discoverContracts();

  if (contracts.length === 0) {
    throw new Error(`No se encontraron contratos OpenAPI en ${CONTRACTS_DIR}`);
  }

  console.log(`Validando ${contracts.length} contrato(s) OpenAPI...`);

  const failures = [];
  for (const { file, path } of contracts) {
    try {
      await validate(path, { schema: true, spec: true });
      console.log(`  OK  ${file}`);
    } catch (error) {
      failures.push({ file, error });
      console.error(`  FAIL ${file}`);
    }
  }

  if (failures.length > 0) {
    for (const { file, error } of failures) {
      console.error(`\n${file}:\n${error?.message ?? error}`);
    }
    throw new Error(
      `${failures.length} contrato(s) OpenAPI inválido(s): ${failures
        .map(({ file }) => file)
        .join(', ')}`,
    );
  }

  console.log('Todos los contratos OpenAPI son válidos.');
}

validateAll().catch((error) => {
  console.error(`\n${error?.message ?? error}`);
  process.exitCode = 1;
});
