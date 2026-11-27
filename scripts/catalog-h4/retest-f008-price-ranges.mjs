import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const PRODUCT_NAME = 'G6 QA Marketplace Desempate';
const PRODUCTS = {
  'g6-qa-marketplace-ord-001': '93f7f500-077d-432e-be98-31cb9ee0d66d',
  'g6-qa-marketplace-ord-002': '8ad24563-c9da-4305-b650-1dd47a14fffb',
};
const CASES = [
  // Equal names use G6's confirmed product_id ASC tie-break: 002, then 001.
  { id: 'F008-price-0-60', minPrice: '0', maxPrice: '60',
    expectedSlugs: ['g6-qa-marketplace-ord-002', 'g6-qa-marketplace-ord-001'] },
  { id: 'F008-price-0-45', minPrice: '0', maxPrice: '45', expectedSlugs: ['g6-qa-marketplace-ord-001'] },
];
const DEFAULT_BASE_URL = 'https://g1-marketplace-backend.onrender.com';
const MAX_BODY_BYTES = 262144;
const BLOCKING_HTTP_STATUS = new Set([401, 403, 404, 408, 425, 429, 500, 502, 503, 504]);

function parseArgs(args) {
  const options = { baseUrl: process.env.CATALOG_BASE_URL ?? DEFAULT_BASE_URL, timeoutMs: 20000 };
  for (let index = 0; index < args.length; index++) {
    const value = args[index + 1];
    if (!value) throw new Error('INVALID_ARGUMENTS');
    if (args[index] === '--base-url') options.baseUrl = value;
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

function exactKeys(value, expected) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
}

function validateBody(body, testCase) {
  if (!exactKeys(body, ['sort', 'data', 'page']) || !Array.isArray(body.data) ||
      !exactKeys(body.page, ['number', 'size', 'totalElements', 'totalPages'])) return 'PUBLIC_PAGE_FIELDS';
  if (body.sort !== 'NAME_ASC') return 'SORT_METADATA';
  const expectedTotal = testCase.expectedSlugs.length;
  const expectedPage = { number: 0, size: 24, totalElements: expectedTotal, totalPages: Math.ceil(expectedTotal / 24) };
  if (Object.keys(expectedPage).some(key => body.page[key] !== expectedPage[key])) return 'PAGE_METADATA';
  if (body.data.length !== expectedTotal) return 'FILTERED_CARD_COUNT';
  const actual = body.data.map(item => ({ productId: item?.productId, slug: item?.slug }));
  const expected = testCase.expectedSlugs.map(slug => ({ productId: PRODUCTS[slug], slug }));
  if (new Set(actual.map(item => item.productId)).size !== actual.length) return 'DUPLICATE_PRODUCT_ID';
  if (JSON.stringify(actual) !== JSON.stringify(expected)) return 'UNEXPECTED_FILTERED_PRODUCT_ORDER';
  return null;
}

export async function retestF008PriceRanges({
  baseUrl = DEFAULT_BASE_URL,
  timeoutMs = 20000,
  fetchImpl = fetch,
} = {}) {
  const base = validateBaseUrl(baseUrl);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) throw new Error('INVALID_TIMEOUT');

  const results = [];
  for (const testCase of CASES) {
    const requestId = randomUUID();
    const requested = { q: PRODUCT_NAME, minPrice: testCase.minPrice, maxPrice: testCase.maxPrice,
      bffPage: 0, pageSize: 24, sort: 'NAME_ASC' };
    const params = new URLSearchParams({ q: requested.q, minPrice: requested.minPrice, maxPrice: requested.maxPrice,
      page: String(requested.bffPage), pageSize: String(requested.pageSize), sort: requested.sort });
    const url = new URL(`/api/v1/catalog/products?${params}`, base);
    const result = {
      case: testCase.id,
      requested,
      g6Mapping: { canal: 'MARKETPLACE', pagina: 1, tamanio: 24,
        precioMin: testCase.minPrice, precioMax: testCase.maxPrice, orden: 'NOMBRE_ASC' },
      expected: { status: 200, source: 'REAL', sort: 'NAME_ASC',
        orderingRule: 'equal names use G6 product_id ASC',
        productIds: testCase.expectedSlugs.map(slug => PRODUCTS[slug]),
        page: { number: 0, size: 24, totalElements: testCase.expectedSlugs.length,
          totalPages: Math.ceil(testCase.expectedSlugs.length / 24) } },
      requestId,
    };
    const started = Date.now();
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'GET', redirect: 'error', cache: 'no-store', credentials: 'omit',
        headers: { Accept: 'application/json', 'X-Request-Id': requestId },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      results.push({ ...result, outcome: 'BLOCKED', code: 'NETWORK_OR_TIMEOUT', durationMs: Date.now() - started });
      break;
    }

    result.status = response.status;
    result.source = response.headers.get('x-catalog-source');
    result.cacheControl = response.headers.get('cache-control');
    result.requestIdEchoed = response.headers.get('x-request-id') === requestId;
    result.durationMs = Date.now() - started;
    if (response.status !== 200) {
      const blocked = BLOCKING_HTTP_STATUS.has(response.status);
      results.push({ ...result, outcome: blocked ? 'BLOCKED' : 'FAIL', code: `HTTP_${response.status}` });
      if (blocked) break;
      continue;
    }
    if (result.source !== 'REAL' || result.cacheControl !== 'no-store' || !result.requestIdEchoed) {
      const blocked = result.source !== 'REAL';
      const code = result.source !== 'REAL' ? 'SOURCE_NOT_REAL' : result.cacheControl !== 'no-store' ? 'CACHE_POLICY' : 'CORRELATION';
      results.push({ ...result, outcome: blocked ? 'BLOCKED' : 'FAIL', code });
      if (blocked) break;
      continue;
    }

    let body;
    try {
      const raw = await response.text();
      if (Buffer.byteLength(raw) > MAX_BODY_BYTES) throw new Error('BODY_LIMIT');
      body = JSON.parse(raw);
    } catch {
      results.push({ ...result, outcome: 'FAIL', code: 'INVALID_JSON' });
      continue;
    }
    result.response = {
      sort: body?.sort ?? null,
      page: body?.page ?? null,
      dataCount: Array.isArray(body?.data) ? body.data.length : null,
      products: Array.isArray(body?.data)
        ? body.data.map(item => ({ productId: item?.productId ?? null, slug: item?.slug ?? null }))
        : null,
    };
    const error = validateBody(body, testCase);
    results.push(error ? { ...result, outcome: 'FAIL', code: error } : { ...result, outcome: 'PASS' });
  }

  for (const testCase of CASES.slice(results.length)) {
    results.push({ case: testCase.id, requested: { q: PRODUCT_NAME, minPrice: testCase.minPrice,
      maxPrice: testCase.maxPrice, bffPage: 0, pageSize: 24, sort: 'NAME_ASC' }, outcome: 'NOT_RUN_AFTER_BLOCK' });
  }
  const status = results.some(result => result.outcome === 'FAIL') ? 'FAIL'
    : results.some(result => result.outcome === 'BLOCKED') ? 'BLOCKED'
      : results.every(result => result.outcome === 'PASS') ? 'PASS' : 'BLOCKED';

  return {
    schema: 1,
    task: 'TASK-F008-INT-001',
    timestampUtc: new Date().toISOString(),
    targetOrigin: base.origin,
    status,
    results,
    limits: [
      'G1 query parameters minPrice/maxPrice map to G6 precioMin/precioMax; BFF page=0 maps to G6 pagina=1 and pageSize=24 to tamanio=24.',
      'The local contract does not publish inclusive/exclusive price-bound semantics. Tested bounds (0–60 and 0–45) do not equal either known product price (39.90 and 49.90), so this run does not infer boundary inclusivity.',
      'Known product IDs, slugs and prices come from G6 confirmation; the public BFF card does not expose price. This runner sends GET only, omits cookies and Authorization, and does not call G6 directly.',
      'The earlier 26/11 Render trace covers 0–100 and records 0–60/0–45 results as slugs and totals; the new requests add product IDs and filtered page metadata for 0–60 and 0–45.',
      'X-Catalog-Source=REAL, IDs and response totals do not independently attest the upstream contract revision, deployed SHA, I-01 approval, dependency #49, UI behavior, or independent acceptance.',
    ],
  };
}

async function main(args) {
  const options = parseArgs(args);
  if (options.output && !/^docs\/evidencias\/H4\/giuliano\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9._-]+\.json$/.test(options.output))
    throw new Error('INVALID_OUTPUT_PATH');
  const report = await retestF008PriceRanges(options);
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
