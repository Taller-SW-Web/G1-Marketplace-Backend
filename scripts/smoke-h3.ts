import 'dotenv/config';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { validateTestDatabase } from './test-database';
import { issueSandboxToken, SANDBOX_CUSTOMERS } from '../src/identity/sandbox-token';

async function main(): Promise<void> {
  const databaseUrl = validateTestDatabase(process.env);
  const reserve = createServer();
  const port = await new Promise<number>((resolve, reject) => {
    reserve.once('error', reject);
    reserve.listen(0, '127.0.0.1', () => {
      const address = reserve.address();
      if (!address || typeof address === 'string') return reject(new Error('No local port'));
      reserve.close(() => resolve(address.port));
    });
  });
  const secret = randomBytes(32).toString('hex');
  const child = spawn(process.execPath, ['dist/main.js'], { stdio: 'ignore', env: {
    ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl, PORT: String(port),
    H3_SANDBOX_ENABLED: 'true', H3_JWT_SECRET: secret,
  } });
  let spawnError = false;
  child.on('error', () => { spawnError = true; });
  const base = `http://127.0.0.1:${port}`;
  const auth = { Authorization: `Bearer ${issueSandboxToken(SANDBOX_CUSTOMERS.A, secret)}` };
  try {
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      if (spawnError || child.exitCode !== null) throw new Error('Compiled server failed to start');
      try { ready = (await fetch(`${base}/health`, { signal: AbortSignal.timeout(500) })).status === 200; }
      catch { /* allow bounded startup time */ }
      if (ready) break;
      await delay(200);
    }
    if (!ready) throw new Error('Compiled server readiness timeout');
    const results: Array<{ step: string; status: number }> = [];
    const call = async (step: string, method: string, expected: number, product?: string, authenticated = true) => {
      const url = `${base}/api/v1/wishlist/items${method === 'DELETE' ? '/PRD-1' : ''}`;
      const response = await fetch(url, { method, signal: AbortSignal.timeout(3000),
        headers: { ...(authenticated ? auth : {}), ...(product ? { 'Content-Type': 'application/json' } : {}) },
        ...(product ? { body: JSON.stringify({ productId: product }) } : {}),
      });
      results.push({ step, status: response.status });
      if (response.status !== expected) throw new Error(`Unexpected HTTP result for ${step}`);
    };
    await call('ensure fixture absent', 'DELETE', 204);
    await call('create', 'POST', 201, 'PRD-1');
    await call('duplicate', 'POST', 200, 'PRD-1');
    await call('remove', 'DELETE', 204);
    await call('repeat remove', 'DELETE', 204);
    await call('unauthenticated', 'POST', 401, 'PRD-1', false);
    await call('inactive', 'POST', 404, 'PRD-INACTIVE');
    await call('catalog unavailable', 'POST', 503, 'PRD-UNAVAILABLE');
    console.log(JSON.stringify({ classification: 'MOCK identity/catalog; REAL compiled HTTP/PostgreSQL', health: 200, results }, null, 2));
  } finally {
    // Only kill the child created by this smoke; never another backend process.
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    child.kill();
    if (child.exitCode === null && child.signalCode === null) await exited;
  }
}

void main().catch(() => {
  process.stderr.write('Compiled H3 smoke failed; check build, isolated DB and configuration\n');
  process.exitCode = 1;
});
