import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { requireEnv, validateTarget } from './target.js';

const profiles = {
  warmup: [{ duration: '30s', target: 1 }],
  load: [
    { duration: '1m', target: 5 },
    { duration: '3m', target: 5 },
    { duration: '1m', target: 0 },
  ],
  stress: [
    { duration: '1m', target: 5 },
    { duration: '2m', target: 10 },
    { duration: '2m', target: 20 },
    { duration: '2m', target: 30 },
    { duration: '1m', target: 0 },
  ],
  spike: [
    { duration: '30s', target: 1 },
    { duration: '10s', target: 30 },
    { duration: '30s', target: 30 },
    { duration: '10s', target: 1 },
    { duration: '30s', target: 1 },
  ],
};

const profileName = (__ENV.PROFILE || 'load').toLowerCase();
if (!profiles[profileName]) {
  throw new Error(`Unknown PROFILE '${profileName}'. Use warmup, load, stress, or spike.`);
}

export const options = {
  scenarios: {
    catalog: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: profiles[profileName],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<800'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
  },
};

export function setup() {
  return {
    baseUrl: validateTarget(),
    query: encodeURIComponent(requireEnv('QA_SEARCH_QUERY')),
    slug: encodeURIComponent(requireEnv('QA_PRODUCT_SLUG')),
  };
}

function request(baseUrl, path, label) {
  const response = http.get(`${baseUrl}${path}`, {
    headers: { Accept: 'application/json' },
    tags: { endpoint: label },
  });
  check(response, {
    [`${label} returns 200`]: (result) => result.status === 200,
    [`${label} has a response body`]: (result) => Boolean(result.body),
  });
}

export default function (data) {
  const route = (__ITER + __VU - 1) % 3;
  if (route === 0) {
    group('home', () => request(data.baseUrl, '/api/v1/catalog/home', 'home'));
  } else if (route === 1) {
    group('search', () => request(
      data.baseUrl,
      `/api/v1/catalog/products?q=${data.query}&sort=NAME_ASC&page=0&pageSize=24`,
      'search',
    ));
  } else {
    group('product-detail', () => request(
      data.baseUrl,
      `/api/v1/catalog/products/${data.slug}`,
      'product-detail',
    ));
  }
  sleep(0.5);
}
