import { check, sleep } from 'k6';
import exec from 'k6/execution';
import http from 'k6/http';
import { validateMockRun } from './safety.js';

const origin = validateMockRun(__ENV);
const profile = __ENV.PERF_PROFILE || 'load';
const workload = __ENV.PERF_CASE || 'catalog';
const sku = 'INKA-RUNNER-42';

if (!['load', 'stress', 'warmup'].includes(profile) || !['catalog', 'cart'].includes(workload)) {
  throw new Error('Expected PERF_PROFILE=load|stress|warmup and PERF_CASE=catalog|cart.');
}
if (profile !== 'load' && workload !== 'catalog') {
  throw new Error('The stress and warmup profiles target the catalog.');
}

// Each plateau is measured separately. Ramp samples are kept out of plateau summaries.
const rampSeconds = 5;
const holdSeconds = 15;
const plateaus = [
  { name: 'vu20', vus: 20 },
  { name: 'vu50', vus: 50 },
  { name: 'vu100', vus: 100 },
  { name: 'vu200', vus: 200 },
  { name: 'recovery', vus: 10 },
];
const stages = plateaus.flatMap(({ vus }) => [
  { duration: `${rampSeconds}s`, target: vus },
  { duration: `${holdSeconds}s`, target: vus },
]);
stages.push({ duration: '5s', target: 0 });

const thresholds = profile === 'load'
  ? {
      'http_req_duration{measured:yes}': ['p(95)<500'],
      'http_req_failed{measured:yes}': ['rate<0.01'],
      checks: ['rate>0.99'],
    }
  : {};

function collectBreakdown(tag) {
  // k6 only includes these submetrics in its summary when they have a threshold.
  thresholds[`http_req_duration{${tag}}`] = ['p(95)>=0'];
  thresholds[`http_reqs{${tag}}`] = ['count>=0'];
  thresholds[`http_req_failed{${tag}}`] = ['rate<=1'];
}

if (profile === 'stress') {
  for (const { name } of plateaus) collectBreakdown(`phase:${name}`);
}
if (workload === 'cart') {
  collectBreakdown('operation:remove');
  collectBreakdown('operation:replay');
}

export const options = {
  discardResponseBodies: true,
  maxRedirects: 0,
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(50)', 'p(95)', 'p(99)'],
  scenarios: {
    [workload]: profile === 'stress'
      ? { executor: 'ramping-vus', startVUs: 0, stages, gracefulRampDown: '0s', gracefulStop: '2s' }
      : { executor: 'constant-vus', vus: profile === 'warmup' ? 2 : 10,
          duration: profile === 'warmup' ? '10s' : '30s', gracefulStop: '2s' },
  },
  thresholds,
};

function catalogPhase() {
  if (profile !== 'stress') return profile;
  const elapsed = (Date.now() - exec.scenario.startTime) / 1000;
  const blockSeconds = rampSeconds + holdSeconds;
  const plateau = plateaus[Math.floor(elapsed / blockSeconds)];
  return plateau && elapsed % blockSeconds >= rampSeconds ? plateau.name : 'ramp';
}

function readCatalog() {
  const response = http.get(`${origin}/api/v1/catalog/home`, {
    tags: { measured: 'yes', operation: 'catalog-home', phase: catalogPhase() },
    timeout: '5s',
  });
  check(response, { 'catalog returns 200': ({ status }) => status === 200 });
}

function removeAndReplay() {
  const cart = `${origin}/api/v1/carts/current/items`;
  const headers = {
    'Content-Type': 'application/json',
    Cookie: `cart_session=h5-perf-cart-${exec.vu.idInTest}`,
  };
  const fixture = http.post(cart, JSON.stringify({ sku, quantity: 1 }), {
    headers,
    tags: { measured: 'no', operation: 'restore-fixture' },
    timeout: '5s',
  });
  if (!check(fixture, { 'cart fixture is ready': ({ status }) => status === 200 || status === 201 })) return;

  const item = `${cart}/${sku}`;
  const removed = http.del(item, null, {
    headers,
    tags: { measured: 'yes', operation: 'remove' },
    timeout: '5s',
  });
  const version = removed.headers['X-Cart-Version'];
  check(removed, { 'first remove returns 204 and a version': ({ status }) => status === 204 && Boolean(version) });
  const replay = http.del(item, null, {
    headers,
    tags: { measured: 'yes', operation: 'replay' },
    timeout: '5s',
  });
  check(replay, {
    'replay returns 204 with the same version': ({ status }) =>
      status === 204 && Boolean(version) && replay.headers['X-Cart-Version'] === version,
  });
}

export default function () {
  if (workload === 'catalog') readCatalog();
  else removeAndReplay();
  sleep(0.2);
}
