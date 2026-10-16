// Directed checks against the compiled API on loopback, with synthetic data only.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const port = 10101;
const base = `http://127.0.0.1:${port}`;
// A conflicting local process must not be mistaken for the instance under test.
try {
  await fetch(`${base}/live`, { signal: AbortSignal.timeout(500) });
  throw new Error(`Port ${port} is already in use`);
} catch (error) {
  if (error.message.includes('already in use')) throw error;
}
const databaseUp = process.env.H3_EXPECT_DATABASE === 'up';
const child = spawn(process.execPath, ['dist/main.js'], {
  env: { ...process.env, PORT: String(port), NODE_ENV: 'test', CATALOG_SOURCE: 'mock',
    CORS_ORIGINS: 'http://127.0.0.1:3100',
    DATABASE_URL: databaseUp ? process.env.DATABASE_URL :
      'postgresql://test:test@127.0.0.1:1/h3_smoke?schema=public&connect_timeout=1' },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
// Capture privately; never print raw app logs (including query inputs).
let logs = '';
child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
child.stderr.on('data', (chunk) => { logs += chunk.toString(); });
const checks = [];
async function get(path, status, headers = {}) {
  const response = await fetch(base + path, { headers, signal: AbortSignal.timeout(8000) });
  assert.equal(response.status, status, path.split('?')[0]);
  return response;
}
try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (child.exitCode !== null) throw new Error('API exited during startup');
    try { await get('/live', 200); ready = true; break; } catch { await delay(250); }
  }
  assert.ok(ready, 'API startup timed out');
  checks.push('compiled-api-liveness');
  const health = await (await get('/ready', databaseUp ? 200 : 503)).json();
  assert.equal(health.database.connected, databaseUp);
  checks.push(databaseUp ? 'readiness-with-disposable-db' : 'readiness-down-without-db');
  const home = await get('/api/v1/catalog/home', 200, { Origin: 'http://127.0.0.1:3100' });
  assert.equal(home.headers.get('x-catalog-source'), 'MOCK');
  assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(home.headers.get('cache-control'), 'no-store');
  assert.equal(home.headers.get('access-control-allow-origin'), 'http://127.0.0.1:3100');
  assert.match(home.headers.get('x-request-id'), /^[a-f0-9-]{36}$/);
  assert.ok(Array.isArray((await home.json()).categories));
  checks.push('catalog-mock-security-headers-and-cors');
  const denied = await get('/api/v1/catalog/home', 200, { Origin: 'https://unauthorized.invalid' });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  checks.push('cors-disallowed-origin-without-grant');
  for (const query of ['q=x', `q=${'x'.repeat(121)}`, 'q=run&q=walk', 'admin=true', 'pageSize=999']) {
    const response = await get('/api/v1/catalog/products?' + query, 400);
    assert.match(response.headers.get('content-type'), /application\/problem\+json/);
    assert.equal((await response.json()).status, 400);
  }
  checks.push('invalid-queries-rejected');
  const marker = 'h3-sensitive-query-marker';
  await get('/api/v1/catalog/products?q=' + marker, 200);
  await delay(100);
  assert.ok(!logs.includes(marker), 'Query leaked to app logs');
  checks.push('search-query-not-in-app-logs');
  await mkdir('.local-security', { recursive: true });
  await writeFile('.local-security/smoke.json', JSON.stringify({ passed: true, checks,
    source: 'MOCK', scope: 'loopback compiled API; not staging DAST' }, null, 2) + '\n');
  console.log(`H3 compiled API smoke: ${checks.length} checks passed (${databaseUp ? 'DB up' : 'DB down'}).`);
} finally {
  if (child.exitCode === null) {
    const closed = once(child, 'close');
    child.kill();
    const timer = setTimeout(() => child.kill('SIGKILL'), 4000);
    try { await closed; } finally { clearTimeout(timer); }
  }
}
