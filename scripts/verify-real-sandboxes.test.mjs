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

    if (url.pathname.includes('/catalog/products') && url.searchParams.get('page') === '-1') {
      return new Response(JSON.stringify({ code: 'INVALID' }), {
        status: 400,
        headers: { 'x-correlation-id': correlationId },
      });
    }
    if (url.pathname.includes('/catalog/products')) {
      return new Response(JSON.stringify({ data: [] }), {
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
