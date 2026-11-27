import http from 'k6/http';
import { check } from 'k6';
import { Rate } from 'k6/metrics';
import { commonHttpThresholds } from './common.js';
import { authenticatedRun } from './safety.js';

const { origin, token } = authenticatedRun();
const authSuccess = new Rate('h5_authenticated_request_success');
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
const readonlyEndpoints = [
  ['cart', '/api/v1/carts/current'],
  ['wishlist', '/api/v1/wishlist'],
];

export const options = {
  discardResponseBodies: true,
  scenarios: {
    authenticated_readonly_soak: {
      executor: 'constant-vus',
      vus: 5,
      duration: '10m',
      gracefulStop: '10s',
    },
  },
  thresholds: {
    ...commonHttpThresholds,
    h5_authenticated_request_success: ['rate>0.99'],
  },
};

export default function () {
  const [name, path] = readonlyEndpoints[(__ITER + __VU - 1) % readonlyEndpoints.length];
  const response = http.get(`${origin}${path}`, {
    headers,
    redirects: 0,
    tags: { endpoint: name, profile: 'authenticated-readonly-soak' },
    timeout: '5s',
  });
  const ok = response.status === 200;
  authSuccess.add(ok, { endpoint: name });
  check(response, { [`authenticated ${name} returns HTTP 200`]: (res) => res.status === 200 });
}
