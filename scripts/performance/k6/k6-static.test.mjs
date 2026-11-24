import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const directory = dirname(fileURLToPath(import.meta.url));
const sourceFiles = readdirSync(directory).filter((file) => file.endsWith('.js'));
const source = (file) => readFileSync(join(directory, file), 'utf8');

test('H5 k6 profiles and shared modules parse without executing a load test', () => {
  for (const file of sourceFiles) {
    const result = spawnSync(process.execPath, ['--check', join(directory, file)], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${file}: ${result.stderr || result.stdout}`);
  }
});

test('loopback guard accepts only local IP literals, explicit MOCK mode, and explicit run approval', async () => {
  const safetyModule = `data:text/javascript;base64,${Buffer.from(source('safety.js')).toString('base64')}`;
  const { validateAuthenticatedRun, validateLoopbackOrigin, validateMockRun, validateOrderRun } = await import(safetyModule);
  assert.equal(validateLoopbackOrigin('http://127.0.0.1:10000'), 'http://127.0.0.1:10000');
  assert.equal(validateLoopbackOrigin('http://[::1]:8080'), 'http://[::1]:8080');
  for (const target of [
    'https://127.0.0.1:10000',
    'http://localhost:10000',
    'http://example.com',
    'http://127.0.0.1.attacker.invalid',
    'http://user:pass@127.0.0.1:10000',
    'http://127.0.0.1:10000/path',
    'http://127.0.0.1:0',
    'http://127.0.0.1:65536',
  ]) {
    assert.throws(() => validateLoopbackOrigin(target), undefined, target);
  }
  assert.throws(() => validateMockRun({}), /PERF_MOCK_MODE=true/);
  assert.throws(() => validateMockRun({ PERF_MOCK_MODE: 'true' }), /PERF_RUN_AUTHORIZED=1/);
  assert.equal(validateMockRun({
    PERF_MOCK_MODE: 'true',
    PERF_RUN_AUTHORIZED: '1',
  }), 'http://127.0.0.1:10000');
  assert.throws(() => validateAuthenticatedRun({
    PERF_MOCK_MODE: 'true',
    PERF_RUN_AUTHORIZED: '1',
  }), /PERF_ACCESS_TOKEN/);
  assert.equal(validateAuthenticatedRun({
    PERF_MOCK_MODE: 'true',
    PERF_RUN_AUTHORIZED: '1',
    PERF_ACCESS_TOKEN: 'local-synthetic-token-001',
  }).origin, 'http://127.0.0.1:10000');
  assert.throws(() => validateOrderRun({
    PERF_MOCK_MODE: 'true',
    PERF_RUN_AUTHORIZED: '1',
    PERF_ACCESS_TOKEN: 'local-synthetic-token-001',
  }), /PERF_CHECKOUT_ADDRESS_ID/);
  assert.deepEqual(validateOrderRun({
    PERF_MOCK_MODE: 'true',
    PERF_RUN_AUTHORIZED: '1',
    PERF_ACCESS_TOKEN: 'local-synthetic-token-001',
    PERF_CHECKOUT_ADDRESS_ID: 'ADR-LOCAL-1',
    PERF_CART_VERSION: '7',
    PERF_CART_SESSION: 'local-cart-session-0001',
    PERF_PREPARATION_IDEMPOTENCY_KEY: '11111111-1111-4111-8111-111111111111',
    PERF_ORDER_IDEMPOTENCY_KEY: '22222222-2222-4222-8222-222222222222',
  }), {
    origin: 'http://127.0.0.1:10000',
    token: 'local-synthetic-token-001',
    addressId: 'ADR-LOCAL-1',
    cartVersion: 7,
    cartSession: 'local-cart-session-0001',
    preparationKey: '11111111-1111-4111-8111-111111111111',
    orderKey: '22222222-2222-4222-8222-222222222222',
  });
});

test('read profiles cover catalog home, search, and detail with failing latency/error thresholds', () => {
  const common = source('common.js');
  assert.match(common, /catalog\/home/);
  assert.match(common, /catalog\/products\?q=running/);
  assert.match(common, /catalog\/products\/\$\{encodeURIComponent\(productSlug\)\}/);
  assert.match(common, /http_req_duration: \['p\(95\)<800'\]/);
  assert.match(common, /http_req_failed: \['rate<0\.01'\]/);
  assert.match(common, /h5_request_success: \['rate>0\.99'\]/);
  for (const file of ['load.js', 'stress.js', 'spike.js']) {
    assert.match(source(file), /ramping-vus/);
    assert.match(source(file), /commonThresholds/);
    assert.match(source(file), /readCatalog/);
  }
});

test('authenticated soak is read-only, token-gated, loopback-only, and never prints credentials or responses', () => {
  const safety = source('safety.js');
  const soak = source('authenticated-soak.js');
  assert.match(safety, /PERF_ACCESS_TOKEN/);
  assert.match(safety, /validateMockRun\(env\)/);
  assert.match(soak, /duration: '10m'/);
  assert.match(soak, /\/api\/v1\/carts\/current/);
  assert.match(soak, /\/api\/v1\/wishlist/);
  assert.match(soak, /http\.get\(/);
  assert.doesNotMatch(soak, /http\.(post|put|patch|del|batch)\(/);
  assert.match(soak, /discardResponseBodies: true/);
  assert.doesNotMatch(soak, /console\.(log|info|warn|error)/);
});

test('authenticated order profile verifies an idempotent replay against the local mock-backed checkout', () => {
  const order = source('authenticated-order.js');
  assert.match(order, /\/api\/v1\/checkout\/quotes/);
  assert.match(order, /\/api\/v1\/checkout\/preparations/);
  assert.match(order, /\/api\/v1\/checkout\/orders/);
  assert.match(order, /'Idempotency-Key': orderKey/);
  assert.match(order, /firstData\.orderId === replayData\?\.orderId/);
  assert.match(order, /orderRun\(\)/);
  assert.match(order, /rate>0\.99/);
  assert.doesNotMatch(order, /console\.(log|info|warn|error)/);
  assert.match(source('safety.js'), /PERF_MOCK_MODE/);
  assert.match(source('safety.js'), /PERF_RUN_AUTHORIZED/);
  assert.match(source('safety.js'), /PERF_ORDER_IDEMPOTENCY_KEY/);
});
