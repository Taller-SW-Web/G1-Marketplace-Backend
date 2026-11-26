import assert from 'node:assert/strict';
import test from 'node:test';
import { breakpointOptions } from './h5-breakpoint-options.mjs';
import { validateAuthenticatedRun } from './safety.js';

test('stress measures each allowed plateau separately at the H5 break thresholds', () => {
  for (const vus of ['400', '800', '1000']) {
    const options = breakpointOptions({ PERF_CASE: 'stress', PERF_VUS: vus });
    assert.equal(options.scenarios.measured.vus, Number(vus));
    assert.equal(options.scenarios.measured.startTime, '20s');
    assert.deepEqual(options.thresholds['http_req_duration{scenario:measured}'], ['p(95)<=500']);
    assert.deepEqual(options.thresholds['http_req_failed{scenario:measured}'], ['rate<=0.01']);
  }
});

test('spike and soak are 5 minutes; unknown modes and load levels fail closed', () => {
  const { stages } = breakpointOptions({ PERF_CASE: 'spike', PERF_VUS: '400' }).scenarios.measured;
  const total = stages.reduce((sum, { duration }) => {
    const parts = /^(?:(\d+)m)?(?:(\d+)s)?$/.exec(duration);
    return sum + Number(parts[1] ?? 0) * 60 + Number(parts[2] ?? 0);
  }, 0);
  assert.equal(total, 300);
  assert.equal(breakpointOptions({ PERF_CASE: 'soak', PERF_VUS: '20' }).scenarios.measured.duration, '5m');
  for (const env of [{}, { PERF_CASE: 'stress', PERF_VUS: '1001' }, { PERF_CASE: 'soak', PERF_VUS: '1000' }]) {
    assert.throws(() => breakpointOptions(env));
  }
});

test('the RE2-compatible token guard preserves length and alphabet restrictions', () => {
  const env = { PERF_MOCK_MODE: 'true', PERF_RUN_AUTHORIZED: '1' };
  for (const size of [16, 8192]) {
    assert.equal(validateAuthenticatedRun({ ...env, PERF_ACCESS_TOKEN: 'a'.repeat(size) }).token.length, size);
  }
  for (const invalid of ['a'.repeat(15), 'a'.repeat(8193), `${'a'.repeat(16)}\n`]) {
    assert.throws(() => validateAuthenticatedRun({ ...env, PERF_ACCESS_TOKEN: invalid }));
  }
});
