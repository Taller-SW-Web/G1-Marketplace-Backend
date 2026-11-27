import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const QUERY = 'G6 QA Marketplace Desempate';
const DEFAULT_BASE_URL = 'https://g1-marketplace-backend.onrender.com';
const EXPECTED = { page: 2, pageSize: 1, totalElements: 2, totalPages: 2, sort: 'NAME_ASC' };

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

export async function retestF010OutOfRange({ baseUrl = DEFAULT_BASE_URL, timeoutMs = 20000, fetchImpl = fetch } = {}) {
  const base = validateBaseUrl(baseUrl);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) throw new Error('INVALID_TIMEOUT');

  const requestId = randomUUID();
  const params = new URLSearchParams({ q: QUERY, page: String(EXPECTED.page), pageSize: String(EXPECTED.pageSize), sort: EXPECTED.sort });
  const url = new URL(`/api/v1/catalog/products?${params}`, base);
  const result = {
    case: 'F010-out-of-range-page-2',
    requested: { bffPage: EXPECTED.page, pageSize: EXPECTED.pageSize, q: QUERY, sort: EXPECTED.sort },
    providerMappingFromSource: { g6Pagina: EXPECTED.page + 1, g6Tamanio: EXPECTED.pageSize, g6Orden: 'NOMBRE_ASC' },
    expectedContractResponse: {
      status: 200,
      body: { sort: EXPECTED.sort, data: [], page: { number: EXPECTED.page, size: EXPECTED.pageSize,
        totalElements: EXPECTED.totalElements, totalPages: EXPECTED.totalPages } },
    },
    requestId,
  };
  const started = Date.now();

  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'error',
      cache: 'no-store',
      credentials: 'omit',
      headers: { Accept: 'application/json', 'X-Request-Id': requestId },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { schema: 1, timestampUtc: new Date().toISOString(), targetOrigin: base.origin, status: 'BLOCKED', result: { ...result, outcome: 'BLOCKED', code: 'NETWORK_OR_TIMEOUT', durationMs: Date.now() - started },
      limits: ['One read-only BFF request; no direct G6 request, cookies, authorization or UI interaction.',
        'No HTTP response/body was observed; expectedContractResponse is derived from the F-010 contract and the known two-product universe.'] };
  }

  result.status = response.status;
  result.source = response.headers.get('x-catalog-source');
  result.cacheControl = response.headers.get('cache-control');
  result.requestIdEchoed = response.headers.get('x-request-id') === requestId;
  result.durationMs = Date.now() - started;
  if (response.status !== 200) {
    const blocked = [401, 403, 404, 429, 500, 502, 503, 504].includes(response.status);
    return { schema: 1, timestampUtc: new Date().toISOString(), targetOrigin: base.origin, status: blocked ? 'BLOCKED' : 'FAIL', result: { ...result, outcome: blocked ? 'BLOCKED' : 'FAIL', code: `HTTP_${response.status}` },
      limits: ['One read-only BFF request; no direct G6 request, cookies, authorization or UI interaction.'] };
  }
  if (result.source !== 'REAL' || result.cacheControl !== 'no-store' || !result.requestIdEchoed) {
    const code = result.source !== 'REAL' ? 'SOURCE_MISMATCH' : result.cacheControl !== 'no-store' ? 'CACHE_POLICY' : 'CORRELATION';
    return { schema: 1, timestampUtc: new Date().toISOString(), targetOrigin: base.origin, status: 'FAIL', result: { ...result, outcome: 'FAIL', code },
      limits: ['One read-only BFF request; no direct G6 request, cookies, authorization or UI interaction.'] };
  }

  let body;
  try {
    const raw = await response.text();
    if (Buffer.byteLength(raw) > 262144) throw new Error('BODY_LIMIT');
    body = JSON.parse(raw);
  } catch {
    return { schema: 1, timestampUtc: new Date().toISOString(), targetOrigin: base.origin, status: 'FAIL', result: { ...result, outcome: 'FAIL', code: 'INVALID_JSON' },
      limits: ['One read-only BFF request; no direct G6 request, cookies, authorization or UI interaction.'] };
  }

  result.response = {
    sort: body?.sort ?? null,
    page: body?.page ?? null,
    dataCount: Array.isArray(body?.data) ? body.data.length : null,
    productIds: Array.isArray(body?.data) ? body.data.map(item => item?.productId ?? null) : null,
  };
  let code = null;
  if (!exactKeys(body, ['sort', 'data', 'page']) || !Array.isArray(body.data) || !exactKeys(body.page, ['number', 'size', 'totalElements', 'totalPages'])) code = 'PUBLIC_PAGE_FIELDS';
  else if (body.sort !== EXPECTED.sort) code = 'SORT_METADATA';
  else if (body.page.number !== EXPECTED.page || body.page.size !== EXPECTED.pageSize ||
      body.page.totalElements !== EXPECTED.totalElements || body.page.totalPages !== EXPECTED.totalPages) code = 'PAGE_METADATA';
  else if (body.data.length !== 0) code = 'OUT_OF_RANGE_NOT_EMPTY';

  return {
    schema: 1,
    timestampUtc: new Date().toISOString(),
    targetOrigin: base.origin,
    status: code ? 'FAIL' : 'PASS',
    result: code ? { ...result, outcome: 'FAIL', code } : { ...result, outcome: 'PASS' },
    limits: [
      'For totalPages=2 with a zero-based BFF index, page 2 is the first page outside the valid indexes 0 and 1.',
      'The provider code maps page + 1 to G6 pagina and pageSize to tamanio; Render internal upstream requests were not captured.',
      'This verifies the API empty-page response only; OPEN-03 UI recovery, published URL/reset behavior, deployment SHA and independent acceptance remain unverified here.',
    ],
  };
}

async function main(args) {
  const options = parseArgs(args);
  if (options.output && !/^docs\/evidencias\/H4\/giuliano\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9._-]+\.json$/.test(options.output))
    throw new Error('INVALID_OUTPUT_PATH');
  const report = await retestF010OutOfRange(options);
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
