import http from 'k6/http';
import { check, sleep } from 'k6';
import { requireEnv, validateTarget } from './target.js';

export const options = {
  scenarios: {
    authenticated_soak: {
      executor: 'constant-vus',
      vus: 2,
      duration: '10m',
      gracefulStop: '15s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<800'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
  },
};

export function setup() {
  const cases = JSON.parse(requireEnv('CHECKOUT_CASES_JSON'));
  if (!Array.isArray(cases) || cases.length < 2) {
    throw new Error('CHECKOUT_CASES_JSON must contain at least two prepared synthetic checkout cases.');
  }
  for (const item of cases) {
    if (!item.checkoutOperationId || !item.idempotencyKey || !item.contact) {
      throw new Error('Each checkout case needs checkoutOperationId, idempotencyKey, and synthetic contact data.');
    }
  }
  return {
    baseUrl: validateTarget(),
    accessToken: requireEnv('G1_TEST_ACCESS_TOKEN'),
    cases,
  };
}

function get(baseUrl, path, token, name) {
  const response = http.get(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    tags: { endpoint: name },
  });
  check(response, { [`${name} returns 2xx`]: (result) => result.status >= 200 && result.status < 300 });
  return response;
}

function postOrder(baseUrl, item, token) {
  return http.post(`${baseUrl}/api/v1/checkout/orders`, JSON.stringify({
    checkoutOperationId: item.checkoutOperationId,
    contact: item.contact,
  }), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Idempotency-Key': item.idempotencyKey,
    },
    tags: { endpoint: 'checkout-order-idempotent' },
  });
}

export default function (data) {
  const item = data.cases[(__VU - 1) % data.cases.length];
  get(data.baseUrl, '/api/v1/carts/current', data.accessToken, 'cart-current');
  get(data.baseUrl, '/api/v1/wishlist', data.accessToken, 'wishlist');

  const first = postOrder(data.baseUrl, item, data.accessToken);
  const replay = postOrder(data.baseUrl, item, data.accessToken);
  check(first, {
    'first order request returns 2xx': (result) => result.status >= 200 && result.status < 300,
  });
  check(replay, {
    'idempotent replay returns 2xx': (result) => result.status >= 200 && result.status < 300,
  });

  const firstOperationId = first.json('data.checkoutOperationId');
  const replayOperationId = replay.json('data.checkoutOperationId');
  check(replay, {
    'idempotent replay keeps the same checkout operation': () => Boolean(firstOperationId)
      && firstOperationId === replayOperationId,
  });
  const firstOrderId = first.json('data.orderId');
  const replayOrderId = replay.json('data.orderId');
  if (firstOrderId || replayOrderId) {
    check(replay, {
      'idempotent replay keeps the same order id': () => Boolean(firstOrderId)
        && firstOrderId === replayOrderId,
    });
  }
  sleep(1);
}
