import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogTimings } from './timings.mjs';
import { measureG6Public } from './measure-g6.mjs';
test('temporary integration budget preserves the five-second target and leaves standard defaults intact', () => {
  assert.deepEqual(catalogTimings(), { providerMs: 5000, proxyMs: 8000, checkMs: 11000, providerTargetMs: 5000 });
  assert.deepEqual(catalogTimings('integration'), { providerMs: 15000, proxyMs: 18000, checkMs: 21000, providerTargetMs: 5000 });
  assert.throws(() => catalogTimings('__proto__'));
});
test('measurement performs only bounded anonymous catalog GETs and never accepts a fast error', async () => {
  let calls = 0;
  const report = await measureG6Public({ baseUrl: 'https://provider.example', query: 'private-query-not-retained', fetchImpl: async (url, options) => {
    calls++; assert.equal(url.pathname, '/api/v1/productos');
    assert.equal(options.method, 'GET'); assert.equal(options.credentials, 'omit');
    assert.equal(new Headers(options.headers).has('Authorization'), false);
    return Response.json({ internal: 'must-not-be-retained' }, { status: calls === 1 ? 503 : 200 });
  } });
  assert.equal(calls, 3); assert.equal(report.results[0].successfulWithinFiveSeconds, false);
  assert.equal(report.grantVerified, false); assert.equal(report.targetAcceptedByG6, false);
  assert.ok(!JSON.stringify(report).includes('private-query')); assert.ok(!JSON.stringify(report).includes('must-not-be-retained'));
});
test('invalid inputs fail before any network request', async () => {
  const fetchImpl = () => { throw new Error('must not request'); };
  for (const baseUrl of ['http://remote.example', 'https://user:pass@host.test', 'https://host.test/api'])
    await assert.rejects(measureG6Public({ baseUrl, fetchImpl }));
  await assert.rejects(measureG6Public({ baseUrl: 'https://host.test', samples: 4, fetchImpl }));
});
