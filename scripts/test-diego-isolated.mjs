import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';

// Owns only the container it creates. No existing datasource or volume is accepted.
const container = `g1-diego-tests-${randomUUID()}`;
const password = randomUUID();
let created = false;
function run(command, args, env = process.env, capture = false) {
  const result = spawnSync(command, args, { env, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`Isolated check failed: ${command} ${args[0] ?? ''}`);
  return result.stdout?.trim();
}
try {
  run('docker', ['run', '--detach', '--rm', '--name', container,
    '--publish', '127.0.0.1::5432', '--env', 'POSTGRES_DB=marketplace_h3_test',
    '--env', `POSTGRES_PASSWORD=${password}`, 'postgres:16-alpine'], process.env, true);
  created = true;
  let ready = false;
  for (let i = 0; i < 60; i++) {
    const probe = spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'postgres', '-d', 'marketplace_h3_test'], { stdio: 'ignore' });
    if (probe.status === 0) { ready = true; break; }
    await setTimeout(500);
  }
  if (!ready) throw new Error('Temporary PostgreSQL did not become ready');
  const binding = run('docker', ['port', container, '5432/tcp'], process.env, true);
  if (!/^127\.0\.0\.1:\d+$/.test(binding)) throw new Error('Unexpected non-loopback binding');
  const url = `postgresql://postgres:${password}@${binding}/marketplace_h3_test?schema=public`;
  const env = { ...process.env, NODE_ENV: 'test', DATABASE_URL: url, TEST_DATABASE_URL: url,
    H3_ALLOW_TEST_DATABASE_WRITES: 'true', H3_SANDBOX_ENABLED: 'true',
    H3_JWT_SECRET: 'isolated-test-fixture-secret-not-for-deployment', AUTH_ENABLED: 'false',
    G7_INTROSPECTION_ENABLED: 'false', G7_REGISTRATION_ENABLED: 'false', G7_RECOVERY_ENABLED: 'false',
    USE_MOCKS: 'true', WISHLIST_SOURCE: 'sandbox', ORDERS_SOURCE: 'unconfigured',
    CSAT_ENABLED: 'false', CSAT_INTEGRATION_APPROVED: 'false', CSAT_PROMPT_APPROVED: 'false' };
  const prisma = resolve('node_modules/prisma/build/index.js');
  run(process.execPath, [prisma, 'migrate', 'deploy'], env);
  // A second deploy must find no pending migrations; never use db push here.
  run(process.execPath, [prisma, 'migrate', 'deploy'], env);
  run(process.execPath, [resolve('node_modules/jest/bin/jest.js'), '--config', 'test/jest-integration.json', '--runInBand'], env);
  run('docker', ['exec', container, 'psql', '-U', 'postgres', '-d', 'marketplace_h3_test',
    '-v', 'ON_ERROR_STOP=1', '-c', 'CREATE DATABASE g1_auth_h4_test'], process.env, true);
  const authUrl = url.replace('/marketplace_h3_test?', '/g1_auth_h4_test?');
  const authEnv = { ...env, DATABASE_URL: authUrl, AUTH_TEST_DATABASE_URL: authUrl };
  run(process.execPath, [prisma, 'migrate', 'deploy'], authEnv);
  run(process.execPath, [resolve('node_modules/jest/bin/jest.js'), '--config', 'test/jest-e2e.json',
    '--runInBand', 'test/auth-g7.e2e-spec.ts'], authEnv);
  console.log('PASS: PostgreSQL 16 disposable instance, migration chain, repeat deploy, integration and persisted G7 sessions.');
} catch (error) {
  console.error(error.message); process.exitCode = 1;
} finally {
  if (created) {
    const cleanup = spawnSync('docker', ['rm', '--force', container], { stdio: 'ignore' });
    if (cleanup.status !== 0) { console.error(`Cleanup required for owned test container ${container}`); process.exitCode = 1; }
  }
}
