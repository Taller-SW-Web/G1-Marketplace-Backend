import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';
import { commonHttpThresholds } from './common.js';
import { orderRun } from './safety.js';

const { origin, token, addressId, cartVersion, cartSession, preparationKey, orderKey } = orderRun();
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
  Cookie: `cart_session=${cartSession}`,
};
const orderReplaySuccess = new Rate('h5_idempotent_order_replay_success');
const syntheticContact = {
  fullName: 'Synthetic Performance Test',
  documentType: 'DNI',
  documentNumber: '00000000',
  phone: '900000000',
  email: 'perf-soak@example.test',
};

export const options = {
  discardResponseBodies: false,
  scenarios: {
    authenticated_idempotent_order: {
      executor: 'constant-vus',
      vus: 1,
      duration: '1m',
      gracefulStop: '10s',
    },
  },
  thresholds: {
    ...commonHttpThresholds,
    h5_idempotent_order_replay_success: ['rate>0.99'],
  },
};

export function setup() {
  const quote = http.post(
    `${origin}/api/v1/checkout/quotes`,
    JSON.stringify({ addressId, cartVersion }),
    {
      headers,
      redirects: 0,
      tags: { endpoint: 'checkout-quote-setup', profile: 'authenticated-idempotent-order' },
      timeout: '5s',
    },
  );
  if (quote.status !== 200) {
    throw new Error('Local quote setup failed; verify the seeded cart/address and MOCK providers.');
  }

  const quoteId = quote.json('data.quoteId');
  const currentCartVersion = quote.json('data.cartVersion');
  if (typeof quoteId !== 'string' || !quoteId || currentCartVersion !== cartVersion) {
    throw new Error('Local quote setup returned an unexpected checkout context.');
  }

  const preparation = http.post(
    `${origin}/api/v1/checkout/preparations`,
    JSON.stringify({ quoteId, cartVersion, simulationConfirmed: true }),
    {
      headers: { ...headers, 'Idempotency-Key': preparationKey },
      redirects: 0,
      tags: { endpoint: 'checkout-preparation-setup', profile: 'authenticated-idempotent-order' },
      timeout: '5s',
    },
  );
  const checkoutOperationId = preparation.json('data.checkoutOperationId');
  if (preparation.status !== 201 || typeof checkoutOperationId !== 'string' || !checkoutOperationId) {
    throw new Error('Local preparation setup failed; verify the seeded cart/address and MOCK providers.');
  }

  return { checkoutOperationId };
}

function submitOrder(checkoutOperationId) {
  return http.post(
    `${origin}/api/v1/checkout/orders`,
    JSON.stringify({ checkoutOperationId, contact: syntheticContact }),
    {
      headers: { ...headers, 'Idempotency-Key': orderKey },
      redirects: 0,
      tags: { endpoint: 'checkout-idempotent-order', profile: 'authenticated-idempotent-order' },
      timeout: '5s',
    },
  );
}

export default function (data) {
  const first = submitOrder(data.checkoutOperationId);
  const replay = submitOrder(data.checkoutOperationId);
  const firstData = first.json('data');
  const replayData = replay.json('data');
  const statusAccepted = [200, 202].includes(first.status) && [200, 202].includes(replay.status);
  const sameOrder =
    firstData?.checkoutOperationId === data.checkoutOperationId &&
    replayData?.checkoutOperationId === data.checkoutOperationId &&
    typeof firstData?.orderId === 'string' &&
    firstData.orderId === replayData?.orderId;
  const success = statusAccepted && sameOrder;

  orderReplaySuccess.add(success);
  check(first, { 'initial order submission is accepted': () => [200, 202].includes(first.status) });
  check(replay, { 'idempotent replay returns the same order': () => success });
  sleep(5);
}
