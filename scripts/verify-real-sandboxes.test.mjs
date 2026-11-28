import assert from 'node:assert/strict';
import test from 'node:test';
import { formatMarkdownReport, runRealSandboxSuite } from './verify-real-sandboxes.mjs';

test('marks unconfigured modules as NO_DISPONIBLE without failing', async () => {
  const report = await runRealSandboxSuite({ env: {} });
  assert.equal(report.piiIncluded, false);
  assert.equal(report.modules.length, 4);
  for (const mod of report.modules) {
    assert.equal(mod.source, 'NO_DISPONIBLE');
    assert.equal(mod.checks.length, 0);
  }
});

test('executes REAL checks, propagates X-Correlation-Id, and omits secrets/PII', async () => {
  const secretToken = 'super-secret-jwt-value-12345';
  const apiKey = 'super-secret-api-key-67890';

  const mockFetch = async (url, init) => {
    const correlationId = init.headers['X-Correlation-Id'];
    assert.ok(correlationId.startsWith('h5-298-'));

    if (url.pathname.includes('/api/v1/productos') && url.searchParams.get('pagina') === '-1') {
      return new Response(JSON.stringify({ code: 'INVALID' }), {
        status: 400,
        headers: { 'x-correlation-id': correlationId },
      });
    }
    if (url.pathname.includes('/api/v1/productos')) {
      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'x-correlation-id': correlationId },
      });
    }
    if (url.pathname === '/.well-known/jwks.json') {
      return new Response(JSON.stringify({ keys: [] }), {
        status: 200,
        headers: { 'x-request-id': correlationId },
      });
    }
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'x-correlation-id': correlationId },
    });
  };

  const report = await runRealSandboxSuite({
    env: {
      G6_SANDBOX_URL: 'https://g6.example.invalid',
      G6_SANDBOX_TOKEN: secretToken,
      G6_SANDBOX_API_KEY: apiKey,
      G7_SANDBOX_URL: 'https://g7.example.invalid',
    },
    fetchImpl: mockFetch,
    correlationId: 'h5-298-test-corr',
  });

  const g6 = report.modules.find((m) => m.module === 'G6');
  const g7 = report.modules.find((m) => m.module === 'G7');
  const g5 = report.modules.find((m) => m.module === 'G5');

  assert.equal(g6.source, 'REAL');
  assert.equal(g6.status, 'PASS');
  assert.equal(g6.checks[0].correlationEchoed, true);

  assert.equal(g7.source, 'REAL');
  assert.equal(g7.status, 'PASS');

  assert.equal(g5.source, 'NO_DISPONIBLE');

  const md = formatMarkdownReport(report);
  const serialized = JSON.stringify(report) + md;
  assert.doesNotMatch(serialized, new RegExp(secretToken));
  assert.doesNotMatch(serialized, new RegExp(apiKey));
});

test('handles transport timeout cleanly as NO_DISPONIBLE', async () => {
  const timeoutFetch = async () => {
    const err = new Error('The operation timed out');
    err.name = 'TimeoutError';
    throw err;
  };

  const report = await runRealSandboxSuite({
    env: { G5_SANDBOX_URL: 'https://g5.example.invalid' },
    fetchImpl: timeoutFetch,
  });

  const g5 = report.modules.find((m) => m.module === 'G5');
  assert.equal(g5.source, 'NO_DISPONIBLE');
  assert.equal(g5.status, 'NO_DISPONIBLE');
  assert.equal(g5.checks[0].status, 'TIMEOUT');
});

test('G2 requires a confirmed same-origin path and rejects 404 as evidence of authentication', async () => {
  const env = { G2_SANDBOX_URL: 'https://g2.example.invalid', G2_SANDBOX_TOKEN: 'fixture-token' };
  const requests = [];
  const fetchImpl = async (url, { headers }) => {
    requests.push([url.pathname, headers.Authorization]);
    return new Response(null, { status: url.pathname === '/health' ? 200 : 404 });
  };

  for (const path of [undefined, '//other.example.invalid/resource']) {
    const report = await runRealSandboxSuite({ env: { ...env, G2_SANDBOX_PROTECTED_PATH: path }, fetchImpl });
    assert.equal(report.modules.find((mod) => mod.module === 'G2').status, 'NO_DISPONIBLE');
  }
  assert.deepEqual(requests, []);

  const report = await runRealSandboxSuite({
    env: { ...env, G2_SANDBOX_PROTECTED_PATH: '/api/v1/fixture' },
    fetchImpl,
  });
  const g2 = report.modules.find((mod) => mod.module === 'G2');
  assert.deepEqual(requests, [['/health', 'Bearer fixture-token'], ['/api/v1/fixture', undefined]]);
  assert.equal(g2.status, 'FAIL');
  assert.equal(g2.checks[1].httpStatus, 404);
});

test('marks module as FAIL when one check returns unexpected HTTP and another times out (local HTTP double)', async () => {
  const { createServer } = await import('node:http');
  const server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'internal' }));
      return;
    }
    // Leave /api/v1/pedidos/... hanging to trigger AbortSignal.timeout
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    const report = await runRealSandboxSuite({
      env: { G5_SANDBOX_URL: `http://127.0.0.1:${port}` },
      timeoutMs: 120,
    });
    const g5 = report.modules.find((m) => m.module === 'G5');
    assert.equal(g5.status, 'FAIL');
    assert.equal(g5.checks[0].status, 'FAIL');
    assert.equal(g5.checks[0].httpStatus, 500);
    assert.equal(g5.checks[1].status, 'TIMEOUT');
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});
