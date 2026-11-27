import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_BASE_URL = 'https://g1-marketplace-backend.onrender.com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 262144;
const BLOCKING_HTTP_STATUS = new Set([401, 403, 404, 408, 425, 429, 500, 502, 503, 504]);

function parseArgs(args) {
  const options = { baseUrl: process.env.CATALOG_BASE_URL ?? DEFAULT_BASE_URL, timeoutMs: 20000 };
  for (let index = 0; index < args.length; index++) {
    const value = args[index + 1];
    if (!value) throw new Error('INVALID_ARGUMENTS');
    if (args[index] === '--base-url') options.baseUrl = value;
    else if (args[index] === '--expected-product-id') options.expectedProductId = value;
    else if (args[index] === '--timeout-ms') options.timeoutMs = Number(value);
    else if (args[index] === '--output') options.output = value;
    else throw new Error('INVALID_ARGUMENTS');
    index++;
  }
  return options;
}

function validateBaseUrl(value) {
  let base;
  try { base = new URL(value); } catch { throw new Error('INVALID_ORIGIN'); }
  const local = base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if ((!local && base.protocol !== 'https:') || base.username || base.password || base.pathname !== '/' || base.search || base.hash)
    throw new Error('INVALID_ORIGIN');
  return base;
}

export async function checkF006FeaturedReal({
  baseUrl = DEFAULT_BASE_URL,
  expectedProductId,
  timeoutMs = 20000,
  fetchImpl = fetch,
} = {}) {
  const base = validateBaseUrl(baseUrl);
  if (typeof expectedProductId !== 'string' || !UUID.test(expectedProductId)) throw new Error('INVALID_EXPECTED_PRODUCT_ID');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) throw new Error('INVALID_TIMEOUT');

  const expectedId = expectedProductId.toLowerCase();
  const requestId = randomUUID();
  const url = new URL('/api/v1/catalog/home', base);
  const started = Date.now();
  const evidence = {
    schema: 1,
    task: 'TASK-F006-INT-001',
    timestampUtc: new Date().toISOString(),
    targetOrigin: base.origin,
    route: 'GET /api/v1/catalog/home',
    expectedProductId: expectedId,
    requestId,
  };

  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET', redirect: 'error', cache: 'no-store', credentials: 'omit',
      headers: { Accept: 'application/json', 'X-Request-Id': requestId },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { ...evidence, status: 'BLOCKED', result: {
      outcome: 'BLOCKED', code: 'NETWORK_OR_TIMEOUT', durationMs: Date.now() - started,
    }, limits: [
      'One read-only GET to the G1 BFF; no Authorization, cookies, direct G6 calls, or environment changes.',
      'No HTTP response was received; the test expectation is not a measured result.',
    ] };
  }

  const observed = {
    httpStatus: response.status,
    source: response.headers.get('x-catalog-source'),
    cacheControl: response.headers.get('cache-control'),
    requestIdEchoed: response.headers.get('x-request-id') === requestId,
    durationMs: Date.now() - started,
  };
  if (response.status !== 200) {
    const blocked = BLOCKING_HTTP_STATUS.has(response.status);
    return { ...evidence, status: blocked ? 'BLOCKED' : 'FAIL', result: {
      ...observed, outcome: blocked ? 'BLOCKED' : 'FAIL', code: `HTTP_${response.status}`,
    }, limits: ['One read-only GET to the G1 BFF; no Authorization, cookies, direct G6 calls, or environment changes.'] };
  }
  if (observed.source !== 'REAL') return { ...evidence, status: 'BLOCKED', result: {
    ...observed, outcome: 'BLOCKED', code: 'SOURCE_NOT_REAL',
  }, limits: ['A MOCK or missing source header does not verify the requested REAL integration.'] };
  if (observed.cacheControl !== 'no-store' || !observed.requestIdEchoed) {
    const code = observed.cacheControl !== 'no-store' ? 'CACHE_POLICY' : 'CORRELATION';
    return { ...evidence, status: 'FAIL', result: { ...observed, outcome: 'FAIL', code } };
  }

  let body;
  try {
    const raw = await response.text();
    if (Buffer.byteLength(raw) > MAX_BODY_BYTES) throw new Error('BODY_LIMIT');
    body = JSON.parse(raw);
  } catch {
    return { ...evidence, status: 'FAIL', result: { ...observed, outcome: 'FAIL', code: 'INVALID_JSON' } };
  }

  if (!Array.isArray(body?.categories) || !Array.isArray(body?.featuredProducts)) {
    return { ...evidence, status: 'FAIL', result: { ...observed, outcome: 'FAIL', code: 'HOME_RESPONSE_FIELDS' } };
  }
  const productIds = body.featuredProducts.map(item => item?.productId);
  if (productIds.some(id => typeof id !== 'string' || !UUID.test(id))) {
    return { ...evidence, status: 'FAIL', result: { ...observed, outcome: 'FAIL', code: 'FEATURED_PRODUCT_ID_INVALID' } };
  }
  const normalizedIds = productIds.map(id => id.toLowerCase());
  const matchingCount = normalizedIds.filter(id => id === expectedId).length;
  const duplicateIds = new Set(normalizedIds).size !== normalizedIds.length;
  const code = duplicateIds ? 'DUPLICATE_FEATURED_PRODUCT_IDS'
    : matchingCount === 1 ? null : matchingCount === 0 ? 'EXPECTED_FEATURED_ID_MISSING' : 'EXPECTED_FEATURED_ID_DUPLICATE';
  const result = {
    ...observed,
    outcome: code ? 'FAIL' : 'PASS',
    response: { categoriesCount: body.categories.length, featuredProductsCount: productIds.length,
      expectedProductPresent: matchingCount === 1, expectedProductCount: matchingCount },
  };
  if (code) result.code = code;
  return {
    ...evidence,
    status: code ? 'FAIL' : 'PASS',
    result,
    limits: [
      'A missing expected ID does not identify a cause: this response does not expose editorial environment flags or G6 product eligibility diagnostics.',
      'The ID is a G1 editorial selection; G6 remains authoritative for whether the selected product is active and publishable.',
      'X-Catalog-Source=REAL and ID presence do not attest the deploy SHA, temporary environment values, OPS/PO approval, or independent acceptance.',
      'This checker never changes runtime environment variables and sends no user credentials.',
    ],
  };
}

async function main(args) {
  const options = parseArgs(args);
  if (options.output && !/^docs\/evidencias\/H4\/giuliano\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9._-]+\.json$/.test(options.output))
    throw new Error('INVALID_OUTPUT_PATH');
  const report = await checkF006FeaturedReal(options);
  const serialized = JSON.stringify(report, null, 2) + '\n';
  if (options.output) {
    await mkdir(dirname(options.output), { recursive: true });
    await writeFile(options.output, serialized, { mode: 0o644 });
  }
  console.log(serialized.trimEnd());
  if (report.status !== 'PASS') process.exitCode = report.status === 'BLOCKED' ? 2 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => {
    console.error(JSON.stringify({ status: 'FAIL', code: /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'CHECK_FAILED' }));
    process.exitCode = 1;
  });
}
