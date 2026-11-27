import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const PRODUCT_NAME = 'G6 QA Marketplace Desempate';
const EXPECTED = [
  { productId: '8ad24563-c9da-4305-b650-1dd47a14fffb', slug: 'g6-qa-marketplace-ord-002' },
  { productId: '93f7f500-077d-432e-be98-31cb9ee0d66d', slug: 'g6-qa-marketplace-ord-001' },
];
const DEFAULT_BASE_URL = 'https://g1-marketplace-backend.onrender.com';
const MAX_BODY_BYTES = 262144;
const BLOCKING_HTTP_STATUS = new Set([401, 403, 404, 429, 500, 502, 503, 504]);

function parseArgs(args) {
  const options = {
    baseUrl: process.env.CATALOG_BASE_URL ?? DEFAULT_BASE_URL,
    timeoutMs: 20000,
  };
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

function isValidPage(body, { sort, page, requestId }) {
  if (!exactKeys(body, ['sort', 'data', 'page']) || !Array.isArray(body.data) ||
      !exactKeys(body.page, ['number', 'size', 'totalElements', 'totalPages'])) return 'PUBLIC_PAGE_FIELDS';
  if (body.sort !== sort) return 'SORT_METADATA';
  if (body.page.number !== page || body.page.size !== 1 || body.page.totalElements !== 2 || body.page.totalPages !== 2)
    return 'PAGE_METADATA';
  if (body.data.length !== 1) return 'PAGE_CARD_COUNT';
  const expected = EXPECTED[page];
  const product = body.data[0];
  if (product?.productId !== expected.productId || product?.name !== PRODUCT_NAME || product?.slug !== expected.slug)
    return 'UNEXPECTED_G6_PRODUCT_ORDER';
  return null;
}

export async function retestF009Tie({
  baseUrl = DEFAULT_BASE_URL,
  timeoutMs = 20000,
  fetchImpl = fetch,
} = {}) {
  const base = validateBaseUrl(baseUrl);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) throw new Error('INVALID_TIMEOUT');

  const results = [];
  for (const sort of ['NAME_ASC', 'NAME_DESC']) {
    for (const page of [0, 1]) {
      const requestId = randomUUID();
      const params = new URLSearchParams({ q: PRODUCT_NAME, page: String(page), pageSize: '1', sort });
      const url = new URL(`/api/v1/catalog/products?${params}`, base);
      const started = Date.now();
      const result = {
        sort,
        requested: { bffPage: page, pageSize: 1, q: PRODUCT_NAME },
        providerMappingFromSource: { g6Pagina: page + 1, g6Tamanio: 1, g6Orden: sort === 'NAME_ASC' ? 'NOMBRE_ASC' : 'NOMBRE_DESC' },
        requestId,
      };

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
        results.push({ ...result, outcome: 'BLOCKED', code: 'NETWORK_OR_TIMEOUT', durationMs: Date.now() - started });
        continue;
      }

      result.status = response.status;
      result.source = response.headers.get('x-catalog-source');
      result.cacheControl = response.headers.get('cache-control');
      result.requestIdEchoed = response.headers.get('x-request-id') === requestId;
      result.durationMs = Date.now() - started;
      if (response.status !== 200) {
        results.push({ ...result, outcome: BLOCKING_HTTP_STATUS.has(response.status) ? 'BLOCKED' : 'FAIL', code: `HTTP_${response.status}` });
        continue;
      }
      if (result.source !== 'REAL' || result.cacheControl !== 'no-store' || !result.requestIdEchoed) {
        const code = result.source !== 'REAL' ? 'SOURCE_MISMATCH' : result.cacheControl !== 'no-store' ? 'CACHE_POLICY' : 'CORRELATION';
        results.push({ ...result, outcome: 'FAIL', code });
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
        item: Array.isArray(body?.data) && body.data.length === 1
          ? { productId: body.data[0].productId, name: body.data[0].name, slug: body.data[0].slug }
          : null,
      };
      const validationError = isValidPage(body, { sort, page, requestId });
      results.push(validationError
        ? { ...result, outcome: 'FAIL', code: validationError }
        : { ...result, outcome: 'PASS' });
    }
  }

  const counts = Object.fromEntries(['PASS', 'FAIL', 'BLOCKED'].map(outcome => [outcome, results.filter(item => item.outcome === outcome).length]));
  return {
    schema: 1,
    timestampUtc: new Date().toISOString(),
    targetOrigin: base.origin,
    transport: 'public G1 BFF; X-Catalog-Source must be REAL',
    checks: counts,
    status: counts.FAIL ? 'FAIL' : counts.BLOCKED ? 'BLOCKED' : 'PASS',
    results,
    limits: [
      'The G1 page index is zero-based; provider.ts maps page + 1 to G6 pagina and forwards pageSize as tamanio.',
      'The BFF card projection does not expose SKU or price; those values are listed separately from the G6 dataset confirmation.',
      'X-Catalog-Source=REAL and matching IDs do not independently attest the configured upstream URL, contract revision, grants, deployed SHA, or human acceptance.',
      'The script sends GET only, omits cookies and authorization, does not call G6 directly, and does not test price sorting.',
    ],
  };
}

async function main(args) {
  const options = parseArgs(args);
  if (options.output && !/^docs\/evidencias\/H4\/giuliano\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9._-]+\.json$/.test(options.output))
    throw new Error('INVALID_OUTPUT_PATH');
  const report = await retestF009Tie(options);
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
