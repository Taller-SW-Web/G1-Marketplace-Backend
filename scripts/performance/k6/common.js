import { Rate } from 'k6/metrics';
import { loopbackOrigin } from './safety.js';

export const BASE_URL = loopbackOrigin();
export const successRate = new Rate('h5_request_success');

export const commonHttpThresholds = {
  http_req_failed: ['rate<0.01'],
  http_req_duration: ['p(95)<800'],
};

export const commonThresholds = {
  ...commonHttpThresholds,
  h5_request_success: ['rate>0.99'],
};

const productSlug = __ENV.PERF_PRODUCT_SLUG || 'zapatillas-running-aero-x';
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(productSlug) || productSlug.length > 120) {
  throw new Error('PERF_PRODUCT_SLUG must be one safe synthetic catalog slug.');
}

const catalogReads = [
  ['home', '/api/v1/catalog/home'],
  ['search', '/api/v1/catalog/products?q=running&pageSize=48'],
  ['detail', `/api/v1/catalog/products/${encodeURIComponent(productSlug)}`],
];

export function readCatalog(http, check) {
  const [name, path] = catalogReads[(__ITER + __VU - 1) % catalogReads.length];
  const response = http.get(`${BASE_URL}${path}`, {
    headers: { Accept: 'application/json' },
    redirects: 0,
    tags: { endpoint: name },
    timeout: '5s',
  });
  const ok = response.status === 200;
  successRate.add(ok, { endpoint: name });
  check(response, { [`${name} returns HTTP 200`]: (res) => res.status === 200 });
}
