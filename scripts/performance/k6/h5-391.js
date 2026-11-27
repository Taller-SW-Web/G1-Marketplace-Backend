import { check, sleep } from 'k6';
import exec from 'k6/execution';
import http from 'k6/http';
import { validateMockRun } from './safety.js';

const origin = validateMockRun(__ENV);
const profile = __ENV.PERF_PROFILE || 'load';
const workload = __ENV.PERF_CASE || 'catalog';
const sku = 'INKA-RUNNER-42';
const maxStressVus = Number(__ENV.PERF_STRESS_MAX_VUS || '400');

if (!['load', 'stress', 'warmup', 'spike', 'soak', 'smoke'].includes(profile) ||
    !['catalog', 'cart'].includes(workload)) {
  throw new Error('Expected a supported PERF_PROFILE and PERF_CASE=catalog|cart.');
}
if (profile !== 'load' && workload !== 'catalog') {
  throw new Error('Only the load profile supports cart.');
}
if (![200, 400, 800, 1000].includes(maxStressVus)) {
  throw new Error('PERF_STRESS_MAX_VUS must be 200, 400, 800 or 1000.');
}

// Each plateau is measured separately. Ramp samples are kept out of plateau summaries.
const rampSeconds = 5;
const holdSeconds = 15;
const stressPlateaus = [
  ...[20, 50, 100, 200, 400, 800, 1000].filter((vus) => vus <= maxStressVus)
    .map((vus) => ({ name: `vu${vus}`, vus, rampSeconds, holdSeconds })),
  { name: 'recovery', vus: 10, rampSeconds, holdSeconds },
];
const spikePlateaus = [
  { name: 'low', vus: 10, rampSeconds: 5, holdSeconds: 15 },
  { name: 'burst', vus: 200, rampSeconds: 1, holdSeconds: 15 },
  { name: 'recovery', vus: 10, rampSeconds: 5, holdSeconds: 15 },
];
const plateaus = profile === 'spike' ? spikePlateaus : stressPlateaus;
const stages = plateaus.flatMap((phase) => [
  { duration: `${phase.rampSeconds}s`, target: phase.vus },
  { duration: `${phase.holdSeconds}s`, target: phase.vus },
]);
stages.push({ duration: '5s', target: 0 });
const isRamp = profile === 'stress' || profile === 'spike';
const steadyProfiles = {
  warmup: { vus: 2, duration: '10s' },
  smoke: { vus: 1, duration: '5s' },
  load: { vus: 10, duration: '30s' },
  soak: { vus: 10, duration: '5m' },
};

const thresholds = ['load', 'soak', 'smoke'].includes(profile)
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

if (isRamp) {
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
    [workload]: isRamp
      ? { executor: 'ramping-vus', startVUs: 0, stages, gracefulRampDown: '0s', gracefulStop: '2s' }
      : { executor: 'constant-vus', ...steadyProfiles[profile], gracefulStop: '2s' },
  },
  thresholds,
};

function catalogPhase() {
  if (!isRamp) return profile;
  let elapsed = (Date.now() - exec.scenario.startTime) / 1000;
  for (const phase of plateaus) {
    if (elapsed < phase.rampSeconds) return 'ramp';
    if (elapsed < phase.rampSeconds + phase.holdSeconds) return phase.name;
    elapsed -= phase.rampSeconds + phase.holdSeconds;
  }
  return 'ramp';
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
