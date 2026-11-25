import { randomUUID } from 'node:crypto';

const baseUrl = 'https://apim-g1-marketplace-20.azure-api.net/v1/';
const subscriptionKey = process.env.APIM_QA_SUBSCRIPTION_KEY;

if (!subscriptionKey) {
  console.error('APIM_QA_SUBSCRIPTION_KEY is not configured; no request was sent.');
  process.exit(1);
}

async function checkRequest({ name, path, expectedStatus, correlationId }) {
  const headers = { 'api-key': subscriptionKey };
  if (correlationId) headers['X-Correlation-Id'] = correlationId;

  let response;
  try {
    response = await fetch(new URL(path, baseUrl), {
      method: 'GET',
      headers,
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    console.error(`${name}: transport failed; request details and credentials omitted.`);
    return false;
  }

  let passed = response.status === expectedStatus;
  console.log(`${name}: HTTP ${response.status}; expected ${expectedStatus}.`);

  if (correlationId) {
    const correlationMatches = response.headers.get('x-correlation-id') === correlationId;
    const requestIdMatches = response.headers.get('x-request-id') === correlationId;
    console.log(`Correlation response matches input: ${correlationMatches}.`);
    console.log(`BFF request-id response matches input: ${requestIdMatches}.`);
    passed = passed && correlationMatches && requestIdMatches;
  }

  await response.body?.cancel().catch(() => {});
  return passed;
}

const correlationId = `qa-${randomUUID()}`;
const results = [];

results.push(await checkRequest({
  name: 'GET /v1/catalog/products?page=0&pageSize=10',
  path: 'catalog/products?page=0&pageSize=10',
  expectedStatus: 200,
  correlationId,
}));

results.push(await checkRequest({
  name: 'GET /v1/wishlist without JWT',
  path: 'wishlist',
  expectedStatus: 401,
}));

if (results.every(Boolean)) {
  console.log('APIM QA smoke passed. Response bodies and subscription key were not logged.');
} else {
  console.error('APIM QA smoke had failing checks; no response bodies or credentials were logged.');
  process.exitCode = 1;
}
