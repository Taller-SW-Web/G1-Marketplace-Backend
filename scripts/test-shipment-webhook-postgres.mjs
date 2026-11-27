import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const rawUrl = process.env.TEST_DATABASE_URL;

if (!rawUrl) {
  console.error('Falta TEST_DATABASE_URL. Se requiere una PostgreSQL desechable local.');
  process.exit(1);
}

let testUrl;
try {
  testUrl = new URL(rawUrl);
} catch {
  console.error('TEST_DATABASE_URL no es una URL válida.');
  process.exit(1);
}

const allowedHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
if (!['postgres:', 'postgresql:'].includes(testUrl.protocol) ||
    !allowedHosts.has(testUrl.hostname.toLowerCase()) ||
    decodeURIComponent(testUrl.pathname.slice(1)) !== 'marketplace_h5_webhook_test') {
  console.error('Por seguridad, la prueba sólo acepta PostgreSQL local marketplace_h5_webhook_test.');
  process.exit(1);
}

const env = { ...process.env, DATABASE_URL: rawUrl, RUN_H5_WEBHOOK_POSTGRES: 'true' };
const nodeModules = resolve(root, 'node_modules');

function run(label, script, args) {
  console.log(label);
  const result = spawnSync(process.execPath, [resolve(nodeModules, script), ...args], {
    cwd: root,
    env,
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(`${label} no pudo iniciarse: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('Aplicando migraciones únicamente a la PostgreSQL H5 desechable…', 'prisma/build/index.js', ['migrate', 'deploy']);
run('Ejecutando pruebas HTTP H-05 contra Prisma/PostgreSQL…', 'jest/bin/jest.js', [
  '--config', './test/jest-e2e.json',
  '--runInBand',
  '--runTestsByPath',
  'test/ventas-shipment-webhook.postgres.e2e-spec.ts',
  'test/c001-qa.postgres.e2e-spec.ts',
]);
